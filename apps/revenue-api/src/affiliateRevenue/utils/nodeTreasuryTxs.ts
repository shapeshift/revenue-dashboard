import type { Hex } from 'viem'
import { padHex } from 'viem'

import { mapConcurrently } from '../../utils/concurrency'

import type { AccountState, CallFrame, EvmLogClient } from './evmLogClient'
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

type PendingTx = {
  blockNumber: number
  from?: string
  tokenTransfers: UnchainedTokenTransfer[]
  internalTxs: UnchainedInternalTx[]
}

// The treasury's txs in the range, shaped like unchained's history, for chains with no unchained host
export const getNodeTreasuryTxs = async (
  client: EvmLogClient,
  treasury: string,
  fromBlock: number,
  toBlock: number
): Promise<UnchainedTx[]> => {
  const treasuryTopic = padHex(treasury as Hex, { size: 32 })
  const txs = new Map<string, PendingTx>()
  const getTx = (txHash: string, blockNumber: number) => {
    let tx = txs.get(txHash)
    if (!tx) txs.set(txHash, (tx = { blockNumber, tokenTransfers: [], internalTxs: [] }))
    return tx
  }

  const [inbound, outbound, changedBlocks] = await Promise.all([
    client.getLogs(undefined, [ERC20_TRANSFER_TOPIC, null, treasuryTopic], fromBlock, toBlock),
    client.getLogs(undefined, [ERC20_TRANSFER_TOPIC, treasuryTopic], fromBlock, toBlock),
    findStateChangeBlocks(blockNumber => client.getAccountState(treasury, blockNumber), fromBlock, toBlock),
  ])

  // Logs only come from successful txs; a malformed Transfer (e.g. ERC721) has no amount in data
  for (const log of [...inbound, ...outbound]) {
    if (log.topics.length !== 3 || log.data === '0x') continue
    getTx(log.transactionHash, Number(BigInt(log.blockNumber))).tokenTransfers.push({
      from: `0x${log.topics[1].slice(26)}`,
      to: `0x${log.topics[2].slice(26)}`,
      value: BigInt(log.data).toString(),
      contract: log.address.toLowerCase(),
      decimals: 0,
      name: '',
      symbol: '',
      type: 'ERC20',
    })
  }

  const traces = await mapConcurrently(changedBlocks, TRACE_CONCURRENCY, async blockNumber => ({
    blockNumber,
    trace: await client.traceBlock(blockNumber),
  }))

  for (const { blockNumber, trace } of traces) {
    for (const { txHash, result } of trace) {
      const internalTxs = collectNativeTransfers(result, treasury)
      if (internalTxs.length === 0) continue

      const tx = getTx(txHash, blockNumber)
      tx.from = result.from.toLowerCase()
      tx.internalTxs.push(...internalTxs)
    }
  }

  const entries = [...txs]
  const [timestamps, senders] = await Promise.all([
    client.getBlockTimestamps([...new Set(entries.map(([, tx]) => tx.blockNumber))]),
    mapConcurrently(entries, TRACE_CONCURRENCY, async ([txHash, tx]) => tx.from ?? client.getTransactionSender(txHash)),
  ])

  return entries
    .map(([txid, tx], i) => ({
      txid,
      blockHeight: tx.blockNumber,
      timestamp: timestamps.get(tx.blockNumber)!,
      status: 1,
      from: senders[i].toLowerCase(),
      to: null,
      value: '0',
      tokenTransfers: tx.tokenTransfers,
      internalTxs: tx.internalTxs,
    }))
    .sort((a, b) => a.blockHeight - b.blockHeight)
}
