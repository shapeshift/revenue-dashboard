import type { Hex } from 'viem'
import { toEventSelector } from 'viem'

import { createSemaphore, mapConcurrently } from '../../utils/concurrency'
import { withRetry } from '../../utils/retry'
import {
  getCachedBlockNumber,
  getCachedBlockTimestamp,
  saveCachedBlockNumber,
  saveCachedBlockTimestamp,
} from '../cache'

import { getBlockByTimestamp, hasMoralisChain } from './dateToBlock'
import { findBlockByTimestamp } from './findBlockByTimestamp'
import { createRpcCaller, isRateLimited, isRetryableRpcError, RpcError } from './rpcCall'

export type Log = { address: Hex; topics: [Hex, ...Hex[]]; data: Hex; blockNumber: Hex; transactionHash: Hex }
export type LogTopics = (Hex | Hex[] | null)[]

export const ERC20_TRANSFER_TOPIC = toEventSelector('Transfer(address,address,uint256)')

type Block = { number: Hex; timestamp: Hex }

// Requests in flight per endpoint key: Alchemy meters one key across all its networks, so every client shares it
const ENDPOINT_CONCURRENCY = 10
const endpointLimiters = new Map<string, ReturnType<typeof createSemaphore>>()

const getEndpointLimiter = (rpcUrl: string) => {
  const url = new URL(rpcUrl)
  const key = url.hostname.endsWith('.g.alchemy.com') ? `alchemy${url.pathname}` : url.origin
  let limiter = endpointLimiters.get(key)
  if (!limiter) endpointLimiters.set(key, (limiter = createSemaphore(ENDPOINT_CONCURRENCY)))
  return limiter
}

// Header lookups and capped log windows in flight per scan
const LOOKUP_CONCURRENCY = 10
const LOG_CONCURRENCY = 5

// A refusal of a window this narrow isn't about the range, so it propagates instead of narrowing further
const MIN_LOG_RANGE = 100

const toHex = (n: number): Hex => `0x${n.toString(16)}`

// The node's own words only: our client-side timeout is a blip to retry, not a refusal to narrow
const refusalText = (error: unknown): string => (error instanceof RpcError ? (error.rpcMessage ?? '') : '')

// Size and timeout refusals are retried narrower; rate limits and outages as-is; anything else fails the scan
export const isRangeRefusal = (error: unknown): boolean =>
  error instanceof RpcError &&
  !isRateLimited(error) &&
  (error.status ?? 0) < 500 &&
  /block range|response size|returned more than|too large|too big|timeout/i.test(refusalText(error))

// Alchemy's size refusal names the range that would have fit: "this block range should work: [0x0, 0x18ccd8a]"
export const getSuggestedEnd = (error: unknown): number | undefined => {
  const match = refusalText(error).match(/should work: \[0x[0-9a-f]+, (0x[0-9a-f]+)\]/i)
  return match ? Number(BigInt(match[1])) : undefined
}

// Reads one EVM chain's logs and block metadata through its node, with the shared caches. Alchemy serves any block
// range under 10K logs and names the range that fits when refusing; `blockRangeCap` is for the networks it caps outright
export const createEvmLogClient = (chainId: string, rpcUrl: string, context: string, blockRangeCap?: number) => {
  const rpcCall = createRpcCaller(rpcUrl)
  const limit = getEndpointLimiter(rpcUrl)
  const call = <T>(method: string, params: unknown[], shouldRetry = isRetryableRpcError): Promise<T> =>
    withRetry(`${context}/${method}`, () => limit(() => rpcCall<T>(method, params)), { shouldRetry })

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
    if (timestamp >= Math.floor(Date.now() / 1000)) return getLatestBlock()

    const indexed = hasMoralisChain(chainId) ? await getBlockByTimestamp(chainId, timestamp) : null
    if (indexed !== null) return indexed

    const block = await findBlockByTimestamp(getBlockTimestamp, await getLatestBlock(), timestamp)
    saveCachedBlockNumber(chainId, timestamp, block)

    return block
  }

  // Asks for everything first; a refusal narrows to the node's suggested end (or half), and windows grow back from there
  const scan = async (address: string | undefined, topics: LogTopics, from: number, to: number): Promise<Log[]> => {
    const logs: Log[] = []
    let cursor = from
    let end = to

    while (cursor <= to) {
      try {
        const batch = await call<Log[]>(
          'eth_getLogs',
          [{ address, fromBlock: toHex(cursor), toBlock: toHex(end), topics }],
          error => isRetryableRpcError(error) && !isRangeRefusal(error)
        )
        logs.push(...batch)
        // Next window is twice the one just accepted, so a halving chain isn't repeated from the top every window
        const width = end - cursor + 1
        cursor = end + 1
        end = Math.min(to, cursor + width * 2 - 1)
      } catch (error) {
        if (!isRangeRefusal(error) || end - cursor < MIN_LOG_RANGE) throw error

        const suggested = getSuggestedEnd(error)
        end =
          suggested !== undefined && suggested >= cursor && suggested < end
            ? suggested
            : cursor + Math.floor((end - cursor) / 2)
      }
    }

    return logs
  }

  const getLogs = async (
    address: string | undefined,
    topics: LogTopics,
    fromBlock: number,
    toBlock: number
  ): Promise<Log[]> => {
    if (blockRangeCap === undefined) return scan(address, topics, fromBlock, toBlock)

    const windows: [number, number][] = []
    for (let start = fromBlock; start <= toBlock; start += blockRangeCap) {
      windows.push([start, Math.min(start + blockRangeCap - 1, toBlock)])
    }
    const perWindow = await mapConcurrently(windows, LOG_CONCURRENCY, ([from, to]) => scan(address, topics, from, to))

    return perWindow.flat()
  }

  return { resolveBlock, getLogs, getBlockTimestamps }
}

export type EvmLogClient = ReturnType<typeof createEvmLogClient>
