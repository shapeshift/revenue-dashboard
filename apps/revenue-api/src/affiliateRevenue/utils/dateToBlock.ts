import axios from 'axios'

import { withRetry } from '../../utils/retry'
import { getCachedBlockNumber, saveCachedBlockNumber } from '../cache'

const MORALIS_DATE_TO_BLOCK_URL = 'https://deep-index.moralis.io/api/v2.2/dateToBlock'

export const MORALIS_API_KEY = process.env.MORALIS_API_KEY

type MoralisDateToBlockResponse = {
  block: number
  timestamp: number
}

// Moralis chain identifier (e.g. 'eth', 'polygon', 'bsc') keyed by CAIP-2 chainId.
const MORALIS_CHAIN_BY_CHAIN_ID: Record<string, string> = {
  'eip155:1': 'eth',
}

/**
 * Resolve a block number for a unix timestamp (seconds) via Moralis' dateToBlock
 * indexer endpoint. Cached per chain+timestamp. Returns null when no API key is
 * configured or the lookup fails, so callers can fall back gracefully.
 */
export const getBlockByTimestamp = async (chainId: string, timestamp: number): Promise<number | null> => {
  const cached = getCachedBlockNumber(chainId, timestamp)
  if (cached !== undefined) return cached

  const moralisChain = MORALIS_CHAIN_BY_CHAIN_ID[chainId]
  if (!moralisChain) {
    console.warn(`[dateToBlock] No Moralis chain mapping for ${chainId}`)
    return null
  }

  if (!MORALIS_API_KEY) {
    console.warn('[dateToBlock] MORALIS_API_KEY not set — cannot resolve block by timestamp')
    return null
  }

  try {
    const { data } = await withRetry('moralis/dateToBlock', () =>
      axios.get<MoralisDateToBlockResponse>(MORALIS_DATE_TO_BLOCK_URL, {
        params: { chain: moralisChain, date: timestamp * 1000 },
        headers: { 'X-API-Key': MORALIS_API_KEY },
      })
    )

    const block = Number(data.block)
    if (!Number.isFinite(block)) return null

    saveCachedBlockNumber(chainId, timestamp, block)
    return block
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[dateToBlock] Failed to resolve block for ${chainId} @ ${timestamp}: ${message}`)
    return null
  }
}
