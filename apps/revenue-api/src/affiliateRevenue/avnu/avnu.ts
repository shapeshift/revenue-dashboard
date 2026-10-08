import { getCachedBlockTimestamp, saveCachedBlockTimestamp } from '../cache'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { getCachedFees } from '../utils'
import { estimateBlockFromTimestamp } from '../utils/blockEstimation'

import {
  BLOCK_ESTIMATION_BUFFER,
  DAO_STARKNET_TREASURY_ADDRESSES,
  STARKNET_BLOCK_TIME_SECONDS,
  STARKNET_CHAIN_ID,
  TRANSFER_SELECTOR,
} from './constants'
import type { StarknetBlock, StarknetEvent, StarknetEventsResponse } from './types'
import { buildAssetId, isAvnuTransfer, parseU256Amount, rpcCall } from './utils'

const getBlockTimestamp = async (blockNumber: number): Promise<number> => {
  // Check cache first
  const cached = getCachedBlockTimestamp(STARKNET_CHAIN_ID, blockNumber)
  if (cached !== undefined) return cached

  // Fetch from RPC
  const { timestamp } = await rpcCall<StarknetBlock>('starknet_getBlockWithTxs', [{ block_number: blockNumber }])

  // Cache with appropriate TTL
  saveCachedBlockTimestamp(STARKNET_CHAIN_ID, blockNumber, timestamp)

  return timestamp
}

const fetchEventsInBlockRange = async (fromBlock: number, toBlock: number): Promise<StarknetEvent[]> => {
  const allEvents: StarknetEvent[] = []
  let continuationToken: string | undefined

  do {
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

    if (!result || !Array.isArray(result.events)) {
      console.error('[avnu] Invalid events response structure')
      break
    }

    allEvents.push(...result.events)
    continuationToken = result.continuation_token
  } while (continuationToken)

  return allEvents
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []

  // Get current block and timestamp
  const currentBlock = await rpcCall<number>('starknet_blockNumber', [])
  const now = Math.floor(Date.now() / 1000)

  // Estimate block range with fixed buffer for block time variance
  const estimatedStart = estimateBlockFromTimestamp(currentBlock, now, startTimestamp, STARKNET_BLOCK_TIME_SECONDS)
  const estimatedEnd = estimateBlockFromTimestamp(currentBlock, now, endTimestamp, STARKNET_BLOCK_TIME_SECONDS)
  const startBlock = Math.max(0, estimatedStart - BLOCK_ESTIMATION_BUFFER)
  const endBlock = Math.min(currentBlock, estimatedEnd + BLOCK_ESTIMATION_BUFFER)

  // Fetch all Transfer events to treasury in block range
  const events = await fetchEventsInBlockRange(startBlock, endBlock)

  // Filter for AVNU-specific transfers
  const avnuEvents = events.filter(e => isAvnuTransfer(e))

  if (avnuEvents.length === 0) {
    return []
  }

  // Collect unique block numbers for timestamp lookup
  const uniqueBlocks = [...new Set(avnuEvents.map(e => e.block_number))]
  const blockTimestamps = new Map<number, number>()

  // Fetch block timestamps in parallel with estimation fallback
  await Promise.all(
    uniqueBlocks.map(async blockNum => {
      try {
        const timestamp = await getBlockTimestamp(blockNum)
        blockTimestamps.set(blockNum, timestamp)
      } catch {
        // Fallback: estimate timestamp using block time and current block
        const blockDelta = currentBlock - blockNum
        const estimatedTimestamp = now - blockDelta * STARKNET_BLOCK_TIME_SECONDS
        blockTimestamps.set(blockNum, Math.floor(estimatedTimestamp))
      }
    })
  )

  // Transform events to Fees
  for (const event of avnuEvents) {
    const timestamp = blockTimestamps.get(event.block_number)
    if (!timestamp) {
      continue
    }

    // Filter by timestamp (events may be outside range due to block estimation)
    if (timestamp < startTimestamp || timestamp > endTimestamp) {
      continue
    }

    const tokenAddress = event.from_address
    const assetId = buildAssetId(tokenAddress)

    // Parse u256 amount from data[0] (low) and data[1] (high)
    const amount = parseU256Amount(event.data[0], event.data[1])

    fees.push({
      chainId: STARKNET_CHAIN_ID,
      assetId,
      service: 'avnu',
      txHash: event.transaction_hash,
      timestamp,
      amount,
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
