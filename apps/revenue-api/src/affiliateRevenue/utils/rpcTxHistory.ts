import type { Hex } from 'viem'
import { padHex } from 'viem'

import { createInflight, createSemaphore, mapConcurrently } from '../../utils/concurrency'

import type { AccountState, CallFrame, EvmLogClient, Log } from './evmLogClient'
import { ERC20_TRANSFER_TOPIC } from './evmLogClient'
import type { UnchainedInternalTx, UnchainedTokenTransfer, UnchainedTx } from './unchained'

const SCAN_CONCURRENCY = 5

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

// A tx's internal transfers, like unchained's: the top-level call's own value is the tx value, not an internal tx
export const collectInternalTxs = (root: CallFrame, treasury: string): UnchainedInternalTx[] =>
  root.error ? [] : (root.calls ?? []).flatMap(call => collectNativeTransfers(call, treasury))

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

// Fee txs come from inbound Transfer logs and traces of changed blocks; their receipts also show treasury spends
const scanTxHistory = async (
  client: EvmLogClient,
  treasury: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<UnchainedTx[]> => {
  const [fromBlock, toBlock] = await client.resolveBlockRange(startTimestamp, endTimestamp)
  if (fromBlock > toBlock) return []

  // A contract or 7702-delegated treasury can move native value without bumping its nonce, which bisection would miss
  const codes = await Promise.all([client.getCode(treasury, fromBlock - 1), client.getCode(treasury, toBlock)])
  if (codes.some(code => code !== '0x')) throw new Error(`Treasury ${treasury} has code; native fees can't be scanned`)

  const probe = createSemaphore(SCAN_CONCURRENCY)
  const found = new Map<string, { blockHeight: number; internalTxs: UnchainedInternalTx[] }>()

  const [inbound, changedBlocks] = await Promise.all([
    client.getLogs(undefined, [ERC20_TRANSFER_TOPIC, null, padHex(treasury as Hex, { size: 32 })], fromBlock, toBlock),
    findStateChangeBlocks(
      blockNumber => probe(() => client.getAccountState(treasury, blockNumber)),
      fromBlock,
      toBlock
    ),
  ])

  // Zero-value transfers are address-poisoning spam, never fees
  for (const log of inbound.filter(log => log.data !== '0x' && BigInt(log.data) > 0n)) {
    found.set(log.transactionHash, { blockHeight: Number(BigInt(log.blockNumber)), internalTxs: [] })
  }

  const traces = await mapConcurrently(changedBlocks, SCAN_CONCURRENCY, async blockNumber => ({
    blockNumber,
    trace: await client.traceBlock(blockNumber),
  }))

  for (const { blockNumber, trace } of traces) {
    for (const { txHash, result } of trace) {
      const internalTxs = collectInternalTxs(result, treasury)
      if (internalTxs.length === 0) continue

      found.set(txHash, { blockHeight: blockNumber, internalTxs })
    }
  }

  const [timestamps, txs] = await Promise.all([
    client.getBlockTimestamps([...new Set([...found.values()].map(({ blockHeight }) => blockHeight))]),
    mapConcurrently([...found], SCAN_CONCURRENCY, async ([txid, tx]) => ({
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
      tokenTransfers: collectTokenTransfers(receipt.logs, treasury),
      internalTxs,
    }))
    .sort((a, b) => a.blockHeight - b.blockHeight)
}

const sharedScans = createInflight<UnchainedTx[]>()

// Unchained-shaped history for chains without an unchained host; concurrent trackers share one scan per window.
// Keyed by timestamps since each tracker's client resolves "now" to its own head block
export const getRpcTxHistory = (
  client: EvmLogClient,
  treasury: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<UnchainedTx[]> =>
  sharedScans(`${client.chainId}:${treasury}:${startTimestamp}:${endTimestamp}`, () =>
    scanTxHistory(client, treasury, startTimestamp, endTimestamp)
  )
