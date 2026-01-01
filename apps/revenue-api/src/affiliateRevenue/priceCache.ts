import axios from 'axios'
import { LRUCache } from 'lru-cache'

import { coingeckoMappingService } from './coingeckoMappingService'

const PRICE_CACHE_TTL = 1000 * 60 * 10 // 10 minutes
const PRICE_API_URL = 'https://api.proxy.shapeshift.com/api/v1/markets/simple/price'

const priceCache = new LRUCache<string, number>({
  max: 500,
  ttl: PRICE_CACHE_TTL,
})

export const getBulkAssetPrices = async (assetIds: string[]): Promise<Map<string, number | null>> => {
  await coingeckoMappingService.ensureLoadedAsync()

  const result = new Map<string, number | null>()
  const uncachedAssetIds: string[] = []

  // 1. Check cache first
  for (const assetId of assetIds) {
    const cached = priceCache.get(assetId)
    if (cached !== undefined) {
      result.set(assetId, cached)
    } else {
      uncachedAssetIds.push(assetId)
    }
  }

  if (uncachedAssetIds.length === 0) return result

  // 2. Convert asset IDs to CoinGecko IDs
  const coingeckoIds = new Set<string>()
  const assetIdToCoingeckoId = new Map<string, string>()

  for (const assetId of uncachedAssetIds) {
    const coingeckoId = coingeckoMappingService.getCoingeckoId(assetId)
    if (coingeckoId) {
      coingeckoIds.add(coingeckoId)
      assetIdToCoingeckoId.set(assetId, coingeckoId)
    } else {
      result.set(assetId, null)
    }
  }

  if (coingeckoIds.size === 0) return result

  // 3. Batch fetch prices for all CoinGecko IDs
  const idsParam = Array.from(coingeckoIds).join(',')
  try {
    const { data } = await axios.get<Record<string, { usd?: number }>>(PRICE_API_URL, {
      params: {
        ids: idsParam,
        vs_currencies: 'usd',
      },
    })

    // 4. Map prices back to asset IDs
    for (const [assetId, coingeckoId] of assetIdToCoingeckoId.entries()) {
      const price = data[coingeckoId]?.usd ?? null
      result.set(assetId, price)
      if (price !== null) {
        priceCache.set(assetId, price)
      }
    }
  } catch (error) {
    console.error('[PriceCache] Failed to fetch bulk prices:', error)
    // Mark all as null
    for (const assetId of uncachedAssetIds) {
      if (!result.has(assetId)) {
        result.set(assetId, null)
      }
    }
  }

  return result
}

export const getAssetPriceUsd = async (assetId: string): Promise<number | null> => {
  const prices = await getBulkAssetPrices([assetId])
  return prices.get(assetId) ?? null
}
