import type { Hex } from 'viem'
import { toEventSelector } from 'viem'

import { mapConcurrently } from '../../utils/concurrency'
import { withRetry } from '../../utils/retry'
import {
  getCachedBlockNumber,
  getCachedBlockTimestamp,
  saveCachedBlockNumber,
  saveCachedBlockTimestamp,
} from '../cache'

import { getBlockByTimestamp, hasMoralisChain } from './dateToBlock'
import { findBlockByTimestamp } from './findBlockByTimestamp'
import { createRpcCaller, isRetryableRpcError, RpcError } from './rpcCall'

export type Log = { address: Hex; topics: [Hex, ...Hex[]]; data: Hex; blockNumber: Hex; transactionHash: Hex }
export type LogTopics = (Hex | Hex[] | null)[]

export const ERC20_TRANSFER_TOPIC = toEventSelector('Transfer(address,address,uint256)')

type Block = { number: Hex; timestamp: Hex }

// Header lookups per node at a time: gentle on public replicas, well inside Alchemy's throughput
const LOOKUP_CONCURRENCY = 10

// Alchemy caps a call at 10K logs or 2,000 to 10,000 blocks per chain; windows start safe and grow while accepted
const LOG_CONCURRENCY = 5
const INITIAL_LOG_RANGE = 50_000
const MIN_LOG_RANGE = 100
const MAX_LOG_RANGE = 500_000

// No RPC exposes a node's block-range limit, so caps named in outright refusals are kept per endpoint
const learnedRangeCaps = new Map<string, number>()

const toHex = (n: number): Hex => `0x${n.toString(16)}`

const refusalText = (error: unknown): string => (error instanceof RpcError ? (error.rpcMessage ?? '') : '')

// Width, weight and timeout refusals are retried narrower; rate limits and outages as-is; the rest fail the scan
const isRangeRefusal = (error: unknown): boolean => {
  if (!(error instanceof RpcError) || error.status === 429 || (error.status ?? 0) >= 500) return false
  return /block range|response size|returned more than|too many|too large|too big|too wide|timeout/i.test(
    error.rpcMessage ?? error.message
  )
}

// Nodes name their cap ("up to a 10,000 block range", "2K block range", "block range: 5000"); size refusals don't
const getRangeCap = (error: unknown): number | undefined => {
  const match = refusalText(error).match(/(\d[\d,]*)\s*(k)?\s*blocks? range|block range(?: of|:|\s*is)?\s*(\d[\d,]*)/i)
  if (!match) return

  const cap = Number((match[1] ?? match[3]).replace(/,/g, ''))
  return match[2] ? cap * 1000 : cap
}

// A size refusal quotes a width that would fit, not the endpoint's limit; only an outright range refusal is that
const isUnconditionalCap = (error: unknown): boolean => !/response size/i.test(refusalText(error))

// Reads one EVM chain's logs and block metadata through its node, with the shared caches
export const createEvmLogClient = (chainId: string, rpcUrl: string, context: string) => {
  const rpcCall = createRpcCaller(rpcUrl)
  const call = <T>(method: string, params: unknown[], shouldRetry = isRetryableRpcError): Promise<T> =>
    withRetry(`${context}/${method}`, () => rpcCall<T>(method, params), { shouldRetry })

  // Header fetches in flight, so concurrent searches share a probe instead of repeating it
  const pendingTimestamps = new Map<number, Promise<number>>()

  const getBlockTimestamp = (blockNumber: number): Promise<number> => {
    const cached = getCachedBlockTimestamp(chainId, blockNumber)
    if (cached !== undefined) return Promise.resolve(cached)

    const pending = pendingTimestamps.get(blockNumber)
    if (pending) return pending

    const fetching = call<Block>('eth_getBlockByNumber', [toHex(blockNumber), false])
      .then(block => {
        const timestamp = Number(BigInt(block.timestamp))
        saveCachedBlockTimestamp(chainId, blockNumber, timestamp)
        return timestamp
      })
      .finally(() => pendingTimestamps.delete(blockNumber))
    pendingTimestamps.set(blockNumber, fetching)

    return fetching
  }

  const getBlockTimestamps = async (blockNumbers: number[]): Promise<Map<number, number>> => {
    const timestamps = new Map<number, number>()

    await mapConcurrently(blockNumbers, LOOKUP_CONCURRENCY, async block => {
      timestamps.set(block, await getBlockTimestamp(block))
    })

    return timestamps
  }

  // The chain head, read once per client so both ends of a window resolve against the same head
  let latestBlock: Promise<number> | undefined
  const getLatestBlock = (): Promise<number> =>
    (latestBlock ??= call<Block>('eth_getBlockByNumber', ['latest', false]).then(block => {
      const number = Number(BigInt(block.number))
      saveCachedBlockTimestamp(chainId, number, Number(BigInt(block.timestamp)))
      return number
    }))

  // Moralis where it indexes the chain (it caches its own answers), else a header search; a future time is the head
  const resolveBlock = async (timestamp: number): Promise<number> => {
    const cached = getCachedBlockNumber(chainId, timestamp)
    if (cached !== undefined) return cached

    const indexed = hasMoralisChain(chainId) ? await getBlockByTimestamp(chainId, timestamp) : null
    if (indexed !== null) return indexed

    const block = await findBlockByTimestamp(getBlockTimestamp, await getLatestBlock(), timestamp)
    saveCachedBlockNumber(chainId, timestamp, block)

    return block
  }

  // Windows grow while accepted. A refusal keeps the accepted ones before it, shrinks to the named cap (or half)
  // and stops the growth; narrowing is the retry, so refusals aren't retried as-is. No address scans every contract
  const getLogs = async (
    address: string | undefined,
    topics: LogTopics,
    fromBlock: number,
    toBlock: number
  ): Promise<Log[]> => {
    const logs: Log[] = []
    let ceiling = learnedRangeCaps.get(rpcUrl) ?? MAX_LOG_RANGE
    let range = Math.min(INITIAL_LOG_RANGE, ceiling)
    let from = fromBlock

    while (from <= toBlock) {
      const windows: [number, number][] = []
      for (let start = from; start <= toBlock && windows.length < LOG_CONCURRENCY; start += range) {
        windows.push([start, Math.min(start + range - 1, toBlock)])
      }

      const results = await Promise.allSettled(
        windows.map(([start, end]) =>
          call<Log[]>(
            'eth_getLogs',
            [{ address, fromBlock: toHex(start), toBlock: toHex(end), topics }],
            error => isRetryableRpcError(error) && !isRangeRefusal(error)
          )
        )
      )

      const refused = results.findIndex(result => result.status === 'rejected')
      for (const result of refused === -1 ? results : results.slice(0, refused)) {
        if (result.status === 'fulfilled') logs.push(...result.value)
      }

      if (refused === -1) {
        from = windows[windows.length - 1][1] + 1
        range = Math.min(range * 2, ceiling)
        continue
      }

      const error = (results[refused] as PromiseRejectedResult).reason
      if (!isRangeRefusal(error) || range <= MIN_LOG_RANGE) throw error

      from = windows[refused][0]
      const cap = getRangeCap(error)
      if (cap !== undefined && cap < range) {
        range = cap
        if (isUnconditionalCap(error)) learnedRangeCaps.set(rpcUrl, cap)
      } else {
        range = Math.floor(range / 2)
      }
      ceiling = range
    }

    return logs
  }

  return { resolveBlock, getLogs, getBlockTimestamps }
}

export type EvmLogClient = ReturnType<typeof createEvmLogClient>
