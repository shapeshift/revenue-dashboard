import type { Hex } from 'viem'

import { formatError } from '../../utils/error'
import { isRetryableError, withRetry } from '../../utils/retry'
import {
  getCachedBlockNumber,
  getCachedBlockTimestamp,
  saveCachedBlockNumber,
  saveCachedBlockTimestamp,
} from '../cache'

import { getBlockByTimestamp, hasMoralisChain } from './dateToBlock'
import { findBlockByTimestamp } from './findBlockByTimestamp'
import { createRpcCaller } from './rpcCall'

export type Log = { address: Hex; topics: [Hex, ...Hex[]]; data: Hex; blockNumber: Hex; transactionHash: Hex }
export type Receipt = { logs: Log[] }
export type LogTopics = (Hex | Hex[] | null)[]

type Block = { timestamp: Hex }

const LOOKUP_CONCURRENCY = 10
const LOG_CONCURRENCY = 5
const INITIAL_LOG_RANGE = 50_000
const MIN_LOG_RANGE = 100
const MAX_LOG_RANGE = 500_000

const toHex = (n: number): Hex => `0x${n.toString(16)}`

// Alchemy answers rate limits and outages as HTTP errors, which the default predicate doesn't retry
const isRetryableRpcError = (error: unknown): boolean =>
  isRetryableError(error) || (error instanceof Error && /RPC HTTP error: (429|5\d\d)/.test(error.message))

// Chains with a block-range cap name it; the oversized-response cap doesn't, so that one halves
const getRangeCap = (error: unknown): number | undefined => {
  const match = formatError(error).match(/block range:? (\d+)|up to a (\d+) block range/)
  if (match) return Number(match[1] ?? match[2])
}

// Reads one EVM chain's logs, receipts and block metadata through its node, with the shared caches
export const createEvmLogClient = (chainId: string, rpcUrl: string, context: string) => {
  const rpcCall = createRpcCaller(rpcUrl)
  const call = <T>(method: string, params: unknown[]): Promise<T> =>
    withRetry(`${context}/${method}`, () => rpcCall<T>(method, params), { shouldRetry: isRetryableRpcError })

  const getBlockTimestamp = async (blockNumber: number): Promise<number> => {
    const cached = getCachedBlockTimestamp(chainId, blockNumber)
    if (cached !== undefined) return cached

    const block = await call<Block>('eth_getBlockByNumber', [toHex(blockNumber), false])
    const timestamp = Number(BigInt(block.timestamp))
    saveCachedBlockTimestamp(chainId, blockNumber, timestamp)

    return timestamp
  }

  const getBlockTimestamps = async (blockNumbers: number[]): Promise<Map<number, number>> => {
    const timestamps = new Map<number, number>()

    for (let i = 0; i < blockNumbers.length; i += LOOKUP_CONCURRENCY) {
      await Promise.all(
        blockNumbers.slice(i, i + LOOKUP_CONCURRENCY).map(async block => {
          timestamps.set(block, await getBlockTimestamp(block))
        })
      )
    }

    return timestamps
  }

  // Moralis answers in one call where it indexes the chain; elsewhere it's a header search on the node
  const resolveBlock = async (timestamp: number): Promise<number | null> => {
    if (hasMoralisChain(chainId)) return getBlockByTimestamp(chainId, timestamp)

    const cached = getCachedBlockNumber(chainId, timestamp)
    if (cached !== undefined) return cached

    const block = await findBlockByTimestamp(rpcUrl, timestamp)
    if (block !== null) saveCachedBlockNumber(chainId, timestamp, block)

    return block
  }

  // A call costs the same at any width, so the window grows while batches are accepted; a refusal
  // shrinks it to the cap the node names (or halves it) and ends the growth, since the node won't
  // accept the refused width later either.
  const getLogs = async (address: string, topics: LogTopics, fromBlock: number, toBlock: number): Promise<Log[]> => {
    const logs: Log[] = []
    let range = INITIAL_LOG_RANGE
    let ceiling = MAX_LOG_RANGE
    let from = fromBlock

    while (from <= toBlock) {
      const windows: [number, number][] = []
      for (let start = from; start <= toBlock && windows.length < LOG_CONCURRENCY; start += range) {
        windows.push([start, Math.min(start + range - 1, toBlock)])
      }

      const results = await Promise.allSettled(
        windows.map(([start, end]) =>
          call<Log[]>('eth_getLogs', [{ address, fromBlock: toHex(start), toBlock: toHex(end), topics }])
        )
      )

      const failed = results.find(result => result.status === 'rejected')
      if (failed) {
        if (range <= MIN_LOG_RANGE) throw failed.reason
        const cap = getRangeCap(failed.reason)
        range = cap ? Math.min(cap, range - 1) : Math.floor(range / 2)
        ceiling = range
        continue
      }

      for (const result of results) logs.push(...(result as PromiseFulfilledResult<Log[]>).value)
      from = windows[windows.length - 1][1] + 1
      range = Math.min(range * 2, ceiling)
    }

    return logs
  }

  const getTransactionReceipt = (txHash: string): Promise<Receipt | null> =>
    call<Receipt | null>('eth_getTransactionReceipt', [txHash])

  return { resolveBlock, getLogs, getBlockTimestamps, getTransactionReceipt }
}

export type EvmLogClient = ReturnType<typeof createEvmLogClient>
