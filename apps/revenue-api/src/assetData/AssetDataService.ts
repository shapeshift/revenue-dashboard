import { LRUCache } from 'lru-cache'

import { COINGECKO_CHAINS } from '../affiliateRevenue/constants'

import { DiskCache } from './cache'
import { decodeAssetData } from './decodeAssetData'
import { fetchAssetData } from './fetcher'
import { MANUAL_ASSETS } from './manualAssets'
import type { StaticAsset } from './types'

type LoadState = 'uninitialized' | 'loading' | 'loaded' | 'failed'

// Module-level state
let loadState: LoadState = 'uninitialized'
let assetData: Map<string, StaticAsset> | null = null
let loadPromise: Promise<void> | null = null

const cache = new DiskCache()
const coingeckoDecimalsCache = new LRUCache<string, { decimals: number | null }>({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24,
})

// Runtime validation helper for CoinGecko API response
const isValidCoinGeckoResponse = (
  data: unknown
): data is {
  detail_platforms?: Record<string, { decimal_place?: number }>
} => {
  if (typeof data !== 'object' || data === null) return false
  if (!('detail_platforms' in data)) return true // detail_platforms is optional

  const platforms = (data as { detail_platforms?: unknown }).detail_platforms
  if (typeof platforms !== 'object' || platforms === null) return false

  return true
}

export async function ensureLoadedAsync(): Promise<void> {
  if (loadState === 'loaded') return

  if (loadState === 'loading') {
    await loadPromise
    return
  }

  loadState = 'loading'
  loadPromise = load()

  try {
    await loadPromise
    loadState = 'loaded'
  } catch (error) {
    console.warn('[AssetDataService] Load failed, using fallback data:', error)
    loadState = 'failed'
    loadFromFallback()
  }
}

export function getAsset(assetId: string): StaticAsset | undefined {
  const asset = assetData?.get(assetId)
  if (asset) return asset

  return MANUAL_ASSETS[assetId.toLowerCase()]
}

export async function getAssetDecimals(assetId: string, useCoinGeckoFallback = true): Promise<number> {
  const mainAsset = assetData?.get(assetId)
  if (mainAsset) return mainAsset.precision

  const manualAsset = MANUAL_ASSETS[assetId.toLowerCase()]
  if (manualAsset) {
    console.log(`[AssetDataService] Using manual asset definition for ${assetId}`)
    return manualAsset.precision
  }

  if (useCoinGeckoFallback) {
    const cgDecimals = await fetchDecimalsFromCoingecko(assetId)
    if (cgDecimals !== null) {
      console.log(`[AssetDataService] Got decimals from CoinGecko for ${assetId}: ${cgDecimals}`)
      return cgDecimals
    }
  }

  return 18
}

async function fetchDecimalsFromCoingecko(assetId: string): Promise<number | null> {
  const cached = coingeckoDecimalsCache.get(assetId)
  if (cached !== undefined) return cached.decimals

  try {
    const [chainPart, tokenPart] = assetId.split('/')
    if (!tokenPart?.startsWith('erc20:')) return null

    const address = tokenPart.replace('erc20:', '')
    const chainId = chainPart.split(':')[1]

    const chainInfo = COINGECKO_CHAINS[chainId]
    if (!chainInfo) return null

    const platform = chainInfo.platform

    const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${address}`
    const response = await fetch(url)

    if (!response.ok) {
      // Only cache 404 (asset not found) - don't cache 5xx or other errors
      if (response.status === 404) {
        coingeckoDecimalsCache.set(assetId, { decimals: null })
      }
      return null
    }

    const rawData = await response.json()

    if (!isValidCoinGeckoResponse(rawData)) {
      console.warn('[AssetDataService] Invalid response from CoinGecko API')
      return null
    }

    const decimals = rawData.detail_platforms?.[platform]?.decimal_place

    if (typeof decimals === 'number') {
      console.log(`[AssetDataService] Got decimals from CoinGecko for ${assetId}: ${decimals}`)
      coingeckoDecimalsCache.set(assetId, { decimals })
      return decimals
    }

    coingeckoDecimalsCache.set(assetId, { decimals: null })
    return null
  } catch (error) {
    // Don't cache network errors - let them retry
    console.warn('[AssetDataService] Network error fetching decimals:', error)
    return null
  }
}

export function isLoaded(): boolean {
  return loadState === 'loaded'
}

export async function reload(): Promise<void> {
  loadState = 'uninitialized'
  assetData = null
  loadPromise = null
  await ensureLoadedAsync()
}

async function load(): Promise<void> {
  if (await loadFromCache()) {
    console.log('[AssetDataService] Loaded from cache')
    return
  }

  if (await loadFromNetwork()) {
    console.log('[AssetDataService] Loaded from network')
    return
  }

  console.warn('[AssetDataService] Using fallback defaults')
  loadFromFallback()
}

async function loadFromCache(): Promise<boolean> {
  const cachedData = await cache.get()
  if (!cachedData) return false

  const { assetData: decodedAssets } = decodeAssetData(cachedData)
  assetData = new Map(Object.entries(decodedAssets))
  return true
}

async function loadFromNetwork(): Promise<boolean> {
  try {
    const encodedData = await fetchAssetData()
    const { assetData: decodedAssets } = decodeAssetData(encodedData)
    assetData = new Map(Object.entries(decodedAssets))

    await cache.set(encodedData)
    return true
  } catch (error) {
    console.warn('[AssetDataService] Network fetch failed:', error)
    return false
  }
}

function loadFromFallback(): void {
  assetData = new Map()
}
