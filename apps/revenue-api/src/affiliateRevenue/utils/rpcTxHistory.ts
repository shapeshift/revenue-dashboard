import type { Hex } from 'viem'
import { padHex } from 'viem'

import { createInflight, mapConcurrently } from '../../utils/concurrency'
import { NATIVE_TOKEN_CONTRACTS } from '../constants'

import type { AccountState, CallFrame, EvmLogClient, Log } from './evmLogClient'
import { ERC20_TRANSFER_TOPIC } from './evmLogClient'
import type { UnchainedInternalTx, UnchainedTokenTransfer, UnchainedTx } from './unchained'

const TRACE_CONCURRENCY = 5

// Bisects to every block where balance or nonce changed; for an EOA, equal ends mean no native movement between
export const findStateChangeBlocks = async (
  getState: (blockNumber: number) => Promise<AccountState>,
  fromBlock: number,
  toBlock: number
): Promise<number[]> => {
  const changed = (a: AccountState, b: AccountState) => a.balance !== b.balance || a.nonce !== b.nonce

  const search = async (lo: number, loState: AccountState, hi: number, hiState: AccountState): Promise<number[]> => {
    if (!changed(loState, hiState)) return []
    if (hi - lo === 1) return [hi]

    const mid = lo + Math.floor((hi - lo) / 2)
    const midState = await getState(mid)
    const [left, right] = await Promise.all([search(lo, loState, mid, midState), search(mid, midState, hi, hiState)])

    return [...left, ...right]
  }

  const [startState, endState] = await Promise.all([getState(fromBlock - 1), getState(toBlock)])
  return search(fromBlock - 1, startState, toBlock, endState)
}

// Value moved to or from the treasury anywhere in a call tree; reverted subtrees moved nothing
export const collectNativeTransfers = (frame: CallFrame, treasury: string): UnchainedInternalTx[] => {
  if (frame.error) return []

  const transfers: UnchainedInternalTx[] = []
  const value = BigInt(frame.value ?? '0x0')
  const type = frame.type.toUpperCase()
  const movesValue = type !== 'DELEGATECALL' && type !== 'STATICCALL' && value > 0n
  const from = frame.from.toLowerCase()
  const to = frame.to?.toLowerCase()

  if (movesValue && to && (from === treasury || to === treasury)) transfers.push({ from, to, value: value.toString() })

  for (const call of frame.calls ?? []) transfers.push(...collectNativeTransfers(call, treasury))

  return transfers
}

// ERC20 transfers to or from the treasury among a tx's logs; a malformed Transfer (e.g. ERC721) has no amount in data
export const collectTokenTransfers = (logs: Log[], treasury: string): UnchainedTokenTransfer[] =>
  logs
    .filter(log => log.topics[0] === ERC20_TRANSFER_TOPIC && log.topics.length === 3 && log.data !== '0x')
    .map(log => ({
      from: `0x${log.topics[1].slice(26)}`.toLowerCase(),
      to: `0x${log.topics[2].slice(26)}`.toLowerCase(),
      value: BigInt(log.data).toString(),
      contract: log.address.toLowerCase(),
      decimals: 0,
      name: '',
      symbol: '',
      type: 'ERC20',
    }))
    .filter(transfer => transfer.from === treasury || transfer.to === treasury)

// Celo's native coin is also an ERC20 whose Transfer log can echo a native value transfer the trace already counted
export const dropNativeTokenEchoes = (
  tokenTransfers: UnchainedTokenTransfer[],
  internalTxs: UnchainedInternalTx[],
  nativeTokenContract: string | undefined
): UnchainedTokenTransfer[] => {
  if (!nativeTokenContract) return tokenTransfers

  const unmatched = [...internalTxs]
  return tokenTransfers.filter(transfer => {
    if (transfer.contract !== nativeTokenContract) return true
    const i = unmatched.findIndex(
      native => native.from === transfer.from && native.to === transfer.to && native.value === transfer.value
    )
    if (i === -1) return true
    unmatched.splice(i, 1)
    return false
  })
}

// Fee txs come from inbound Transfer logs and traces of changed blocks; their receipts also show treasury spends
const scanTxHistory = async (
  client: EvmLogClient,
  treasury: string,
  fromBlock: number,
  toBlock: number
): Promise<UnchainedTx[]> => {
  // A contract or 7702-delegated treasury can move native value without bumping its nonce, which bisection would miss
  const codes = await Promise.all([client.getCode(treasury, fromBlock - 1), client.getCode(treasury, toBlock)])
  if (codes.some(code => code !== '0x')) throw new Error(`Treasury ${treasury} has code; native fees can't be scanned`)

  const found = new Map<string, { blockHeight: number; internalTxs: UnchainedInternalTx[] }>()

  const [inbound, changedBlocks] = await Promise.all([
    client.getLogs(undefined, [ERC20_TRANSFER_TOPIC, null, padHex(treasury as Hex, { size: 32 })], fromBlock, toBlock),
    findStateChangeBlocks(blockNumber => client.getAccountState(treasury, blockNumber), fromBlock, toBlock),
  ])

  for (const log of inbound) {
    found.set(log.transactionHash, { blockHeight: Number(BigInt(log.blockNumber)), internalTxs: [] })
  }

  const traces = await mapConcurrently(changedBlocks, TRACE_CONCURRENCY, async blockNumber => ({
    blockNumber,
    trace: await client.traceBlock(blockNumber),
  }))

  for (const { blockNumber, trace } of traces) {
    for (const { txHash, result } of trace) {
      const internalTxs = collectNativeTransfers(result, treasury)
      if (internalTxs.length === 0) continue

      found.set(txHash, { blockHeight: blockNumber, internalTxs })
    }
  }

  const [timestamps, txs] = await Promise.all([
    client.getBlockTimestamps([...new Set([...found.values()].map(({ blockHeight }) => blockHeight))]),
    mapConcurrently([...found], TRACE_CONCURRENCY, async ([txid, tx]) => ({
      txid,
      ...tx,
      receipt: await client.getReceipt(txid),
    })),
  ])

  return txs
    .map(({ txid, blockHeight, internalTxs, receipt }) => ({
      txid,
      blockHeight,
      timestamp: timestamps.get(blockHeight)!,
      status: Number(BigInt(receipt.status)),
      from: receipt.from.toLowerCase(),
      to: null,
      value: '0',
      tokenTransfers: dropNativeTokenEchoes(
        collectTokenTransfers(receipt.logs, treasury),
        internalTxs,
        NATIVE_TOKEN_CONTRACTS[client.chainId]
      ),
      internalTxs,
    }))
    .sort((a, b) => a.blockHeight - b.blockHeight)
}

const sharedScans = createInflight<UnchainedTx[]>()

// Unchained-shaped history for chains without an unchained host; concurrent trackers share one scan per range
export const getRpcTxHistory = (
  client: EvmLogClient,
  treasury: string,
  fromBlock: number,
  toBlock: number
): Promise<UnchainedTx[]> =>
  sharedScans(`${client.chainId}:${treasury}:${fromBlock}:${toBlock}`, () =>
    scanTxHistory(client, treasury, fromBlock, toBlock)
  )
