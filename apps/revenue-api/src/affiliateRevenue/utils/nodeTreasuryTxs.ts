import type { Hex } from 'viem'
import { padHex } from 'viem'

import { mapConcurrently } from '../../utils/concurrency'

import type { AccountState, CallFrame, EvmLogClient, Log } from './evmLogClient'
import { ERC20_TRANSFER_TOPIC } from './evmLogClient'
import type { UnchainedInternalTx, UnchainedTokenTransfer, UnchainedTx } from './unchained'

const TRACE_CONCURRENCY = 5

// An EOA's balance only drops when it sends, which bumps its nonce, so equal state at both ends means no native
// movement in between; bisecting finds every block where the state changed
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
  const movesValue = frame.type !== 'DELEGATECALL' && frame.type !== 'STATICCALL' && value > 0n
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

// The txs in the range that paid the treasury, shaped like unchained's history, for chains with no unchained host.
// Fees arrive as ERC20 transfers in (logs) or native value in (traces of the blocks where the balance moved); each such
// tx's receipt then gives its sender and every token movement, so spends by the treasury in the same tx are still seen
export const getNodeTreasuryTxs = async (
  client: EvmLogClient,
  treasury: string,
  fromBlock: number,
  toBlock: number
): Promise<UnchainedTx[]> => {
  const blockByTx = new Map<string, number>()
  const internalTxsByTx = new Map<string, UnchainedInternalTx[]>()

  const [inbound, changedBlocks] = await Promise.all([
    client.getLogs(undefined, [ERC20_TRANSFER_TOPIC, null, padHex(treasury as Hex, { size: 32 })], fromBlock, toBlock),
    findStateChangeBlocks(blockNumber => client.getAccountState(treasury, blockNumber), fromBlock, toBlock),
  ])

  for (const log of inbound) blockByTx.set(log.transactionHash, Number(BigInt(log.blockNumber)))

  const traces = await mapConcurrently(changedBlocks, TRACE_CONCURRENCY, async blockNumber => ({
    blockNumber,
    trace: await client.traceBlock(blockNumber),
  }))

  for (const { blockNumber, trace } of traces) {
    for (const { txHash, result } of trace) {
      const internalTxs = collectNativeTransfers(result, treasury)
      if (internalTxs.length === 0) continue

      blockByTx.set(txHash, blockNumber)
      internalTxsByTx.set(txHash, internalTxs)
    }
  }

  const entries = [...blockByTx]
  const [timestamps, receipts] = await Promise.all([
    client.getBlockTimestamps([...new Set(blockByTx.values())]),
    mapConcurrently(entries, TRACE_CONCURRENCY, ([txHash]) => client.getReceipt(txHash)),
  ])

  return entries
    .map(([txid, blockHeight], i) => ({
      txid,
      blockHeight,
      timestamp: timestamps.get(blockHeight)!,
      status: Number(BigInt(receipts[i].status)),
      from: receipts[i].from.toLowerCase(),
      to: null,
      value: '0',
      tokenTransfers: collectTokenTransfers(receipts[i].logs, treasury),
      internalTxs: internalTxsByTx.get(txid) ?? [],
    }))
    .sort((a, b) => a.blockHeight - b.blockHeight)
}
