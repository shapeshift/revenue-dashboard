import { createSemaphore, mapConcurrently } from '../../utils/concurrency'
import {
  getCachedBlockNumber,
  getCachedBlockTimestamp,
  saveCachedBlockNumber,
  saveCachedBlockTimestamp,
} from '../cache'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { findBlockByTimestamp, getCachedFees } from '../utils'

import { DAO_STARKNET_TREASURY_ADDRESSES, STARKNET_CHAIN_ID, TRANSFER_SELECTOR } from './constants'
import type { StarknetBlock, StarknetEvent, StarknetEventsResponse } from './types'
import { buildAssetId, isAvnuTransfer, parseU256Amount, rpcCall } from './utils'

const LOOKUP_CONCURRENCY = 10
// A filtered range pages sequentially, so a month is scanned as parallel slices; the limit is shared because
// concurrent months beyond it made the RPC time out
const EVENT_SCAN_SLICES = 8
// Over a day of ~1.7s blocks, so the recent window (up to a day plus the settle delay) skips the shared queue
const MIN_SLICE_BLOCKS = 60_000
const scanLimit = createSemaphore(EVENT_SCAN_SLICES)

const getBlockTimestamp = async (blockNumber: number): Promise<number> => {
  const cached = getCachedBlockTimestamp(STARKNET_CHAIN_ID, blockNumber)
  if (cached !== undefined) return cached

  const { timestamp } = await rpcCall<StarknetBlock>('starknet_getBlockWithTxHashes', [{ block_number: blockNumber }])
  saveCachedBlockTimestamp(STARKNET_CHAIN_ID, blockNumber, timestamp)

  return timestamp
}

// No indexer covers Starknet, so the block is found by searching headers
const resolveBlock = async (timestamp: number, latestBlock: number): Promise<number> => {
  if (timestamp >= Math.floor(Date.now() / 1000)) return latestBlock

  const cached = getCachedBlockNumber(STARKNET_CHAIN_ID, timestamp)
  if (cached !== undefined) return cached

  const block = await findBlockByTimestamp(getBlockTimestamp, latestBlock, timestamp)
  saveCachedBlockNumber(STARKNET_CHAIN_ID, timestamp, block)

  return block
}

const fetchEventsInSlice = async (
  fromBlock: number,
  toBlock: number,
  scan: { failed: boolean } = { failed: false }
): Promise<StarknetEvent[]> => {
  const allEvents: StarknetEvent[] = []
  let continuationToken: string | undefined

  do {
    if (scan.failed) throw new Error('[avnu] scan abandoned after another slice failed')
    const result = await rpcCall<StarknetEventsResponse>('starknet_getEvents', [
      {
        from_block: { block_number: fromBlock },
        to_block: { block_number: toBlock },
        keys: [
          [TRANSFER_SELECTOR], // Transfer events only
          [], // from: any (empty array is wildcard)
          DAO_STARKNET_TREASURY_ADDRESSES, // to: treasury (Starknet OR-matches inside the inner array)
        ],
        chunk_size: 1000,
        continuation_token: continuationToken,
      },
    ])

    // Partial events would be cached as the complete range
    if (!result || !Array.isArray(result.events)) throw new Error('[avnu] Invalid events response structure')

    allEvents.push(...result.events)
    continuationToken = result.continuation_token
  } while (continuationToken)

  return allEvents
}

const fetchEventsInBlockRange = async (fromBlock: number, toBlock: number): Promise<StarknetEvent[]> => {
  if (toBlock - fromBlock + 1 <= MIN_SLICE_BLOCKS) return fetchEventsInSlice(fromBlock, toBlock)

  const width = Math.max(MIN_SLICE_BLOCKS, Math.ceil((toBlock - fromBlock + 1) / EVENT_SCAN_SLICES))
  const slices: [number, number][] = []
  for (let from = fromBlock; from <= toBlock; from += width) slices.push([from, Math.min(toBlock, from + width - 1)])

  const scan = { failed: false }
  const events = await Promise.all(
    slices.map(([from, to]) =>
      scanLimit(() => fetchEventsInSlice(from, to, scan)).catch((error: unknown) => {
        scan.failed = true
        throw error
      })
    )
  )
  return events.flat()
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const latestBlock = await rpcCall<number>('starknet_blockNumber', [])
  const [startBlock, endBlock] = await Promise.all([
    resolveBlock(startTimestamp, latestBlock),
    resolveBlock(endTimestamp, latestBlock),
  ])

  const events = await fetchEventsInBlockRange(startBlock, endBlock)
  const avnuEvents = events.filter(e => isAvnuTransfer(e))

  const blockTimestamps = new Map<number, number>()
  await mapConcurrently([...new Set(avnuEvents.map(e => e.block_number))], LOOKUP_CONCURRENCY, async blockNumber => {
    blockTimestamps.set(blockNumber, await getBlockTimestamp(blockNumber))
  })

  const fees: Fees[] = []
  for (const event of avnuEvents) {
    const timestamp = blockTimestamps.get(event.block_number)!
    if (timestamp < startTimestamp || timestamp > endTimestamp) continue

    fees.push({
      chainId: STARKNET_CHAIN_ID,
      assetId: buildAssetId(event.from_address),
      service: 'avnu',
      txHash: event.transaction_hash,
      timestamp,
      amount: parseU256Amount(event.data[0], event.data[1]),
    })
  }

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()
  const { fees, cacheHits, cacheMisses } = await getCachedFees(
    'avnu',
    STARKNET_CHAIN_ID,
    startTimestamp,
    endTimestamp,
    fetchFeesFromAPI
  )

  console.log(
    `[avnu] Total: ${fees.length} fees in ${Date.now() - startTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return enrichFeesWithUsdPrices(fees)
}
