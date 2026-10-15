import type { Hex } from 'viem'
import { decodeEventLog, isAddressEqual, toEventSelector } from 'viem'

import { formatError } from '../../utils/error'
import { isRetryableError, withRetry } from '../../utils/retry'
import {
  getCachedBlockNumber,
  getCachedBlockTimestamp,
  saveCachedBlockNumber,
  saveCachedBlockTimestamp,
} from '../cache'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import {
  buildAssetId,
  createRpcCaller,
  findBlockByTimestamp,
  getBlockByTimestamp,
  getCachedFees,
  hasMoralisChain,
} from '../utils'

import type { FyndChain } from './constants'
import { FEES_TAKEN_EVENT, FYND_CHAINS, FYND_FEE_RECEIVER, FYND_FIRST_FEE_TIMESTAMP } from './constants'

export type Log = { topics: [Hex, ...Hex[]]; data: Hex; blockNumber: Hex; transactionHash: Hex }
export type FeeTaken = { token: string; fee: bigint; blockNumber: number; txHash: string }

type Block = { timestamp: Hex }

const FEES_TAKEN_TOPIC = toEventSelector(FEES_TAKEN_EVENT)
const LOOKUP_CONCURRENCY = 10
const RPC_CONCURRENCY = 5
const INITIAL_LOG_RANGE = 50_000
const MIN_LOG_RANGE = 100
const MAX_LOG_RANGE = 500_000

const toHex = (n: number): Hex => `0x${n.toString(16)}`

// Our share of one swap's fees, or undefined when the swap carried no fee for our receiver
export const decodeOurFee = (log: Log): FeeTaken | undefined => {
  const { args } = decodeEventLog({ abi: [FEES_TAKEN_EVENT], topics: log.topics, data: log.data })

  const fee = args.fees
    .filter(({ recipient }) => isAddressEqual(recipient, FYND_FEE_RECEIVER))
    .reduce((sum, { feeAmount }) => sum + feeAmount, 0n)
  if (fee === 0n) return

  return { token: args.token.toLowerCase(), fee, blockNumber: Number(log.blockNumber), txHash: log.transactionHash }
}

// Alchemy answers rate limits and outages as HTTP errors, which the default predicate doesn't retry
const isRetryableRpcError = (error: unknown): boolean =>
  isRetryableError(error) || (error instanceof Error && /RPC HTTP error: (429|5\d\d)/.test(error.message))

// Chains with a block-range cap name it; the oversized-response cap doesn't, so that one halves
const getRangeCap = (error: unknown): number | undefined => {
  const match = formatError(error).match(/block range:? (\d+)|up to a (\d+) block range/)
  if (match) return Number(match[1] ?? match[2])
}

const createChainClient = (chain: FyndChain) => {
  const rpcCall = createRpcCaller(chain.rpcUrl)
  const call = <T>(method: string, params: unknown[]): Promise<T> =>
    withRetry(`fynd:${chain.network}/${method}`, () => rpcCall<T>(method, params), { shouldRetry: isRetryableRpcError })

  const getBlockTimestamp = async (blockNumber: number): Promise<number> => {
    const cached = getCachedBlockTimestamp(chain.chainId, blockNumber)
    if (cached !== undefined) return cached

    const block = await call<Block>('eth_getBlockByNumber', [toHex(blockNumber), false])
    const timestamp = Number(BigInt(block.timestamp))
    saveCachedBlockTimestamp(chain.chainId, blockNumber, timestamp)

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
    if (hasMoralisChain(chain.chainId)) return getBlockByTimestamp(chain.chainId, timestamp)

    const cached = getCachedBlockNumber(chain.chainId, timestamp)
    if (cached !== undefined) return cached

    const block = await findBlockByTimestamp(chain.rpcUrl, timestamp)
    if (block !== null) saveCachedBlockNumber(chain.chainId, timestamp, block)

    return block
  }

  // Every FeesTaken on the router, ours or not. A call costs the same at any width, so the window grows
  // while batches are accepted; a refusal shrinks it to the cap the node names (or halves it) and
  // ends the growth, since the node won't accept the refused width later either.
  const getFeesTakenLogs = async (fromBlock: number, toBlock: number): Promise<Log[]> => {
    const logs: Log[] = []
    let range = INITIAL_LOG_RANGE
    let ceiling = MAX_LOG_RANGE
    let from = fromBlock

    while (from <= toBlock) {
      const windows: [number, number][] = []
      for (let start = from; start <= toBlock && windows.length < RPC_CONCURRENCY; start += range) {
        windows.push([start, Math.min(start + range - 1, toBlock)])
      }

      const results = await Promise.allSettled(
        windows.map(([start, end]) =>
          call<Log[]>('eth_getLogs', [
            { address: chain.router, fromBlock: toHex(start), toBlock: toHex(end), topics: [FEES_TAKEN_TOPIC] },
          ])
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

  return { resolveBlock, getFeesTakenLogs, getBlockTimestamps }
}

const fetchChainFees = async (chain: FyndChain, startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const client = createChainClient(chain)

  const [fromBlock, toBlock] = await Promise.all([client.resolveBlock(startTimestamp), client.resolveBlock(endTimestamp)])
  if (fromBlock === null || toBlock === null) {
    throw new Error(`could not resolve blocks for ${startTimestamp}-${endTimestamp}`)
  }

  const logs = await client.getFeesTakenLogs(fromBlock, toBlock)
  const events = logs.map(decodeOurFee).filter((event): event is FeeTaken => event !== undefined)
  const timestamps = await client.getBlockTimestamps([...new Set(events.map(event => event.blockNumber))])

  return events
    .map(event => ({
      chainId: chain.chainId,
      assetId: buildAssetId(chain.chainId, event.token),
      service: 'fynd' as const,
      txHash: event.txHash,
      timestamp: timestamps.get(event.blockNumber)!,
      amount: event.fee.toString(),
    }))
    .filter(fee => fee.timestamp >= startTimestamp && fee.timestamp <= endTimestamp)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const scanStart = Math.max(startTimestamp, FYND_FIRST_FEE_TIMESTAMP)
  if (endTimestamp < scanStart) return []

  const results = await Promise.allSettled(
    FYND_CHAINS.map(chain =>
      getCachedFees('fynd', chain.chainId, scanStart, endTimestamp, (start, end) =>
        fetchChainFees(chain, start, end)
      )
    )
  )

  const fees = results.flatMap((result, i) => {
    if (result.status === 'fulfilled') return result.value.fees
    console.error(`[fynd] ${FYND_CHAINS[i].network} failed: ${formatError(result.reason)}`)
    return []
  })
  const sorted = fees.sort((a, b) => b.timestamp - a.timestamp)

  console.log(`[fynd] Total: ${sorted.length} fees in ${Date.now() - startTime}ms`)

  return enrichFeesWithUsdPrices(sorted)
}
