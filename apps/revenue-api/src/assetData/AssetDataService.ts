import { LRUCache } from 'lru-cache'

import { COINGECKO_CHAINS } from '../affiliateRevenue/constants'

import { DiskCache } from './cache'
import { decodeAssetData } from './decodeAssetData'
import { fetchAssetData } from './fetcher'
import { MANUAL_ASSETS } from './manualAssets'
import type { StaticAsset } from './types'

type LoadState = 'uninitialized' | 'loading' | 'loaded' | 'failed'

class AssetDataService {
  private static instance: AssetDataService
  private loadState: LoadState = 'uninitialized'
  private assetData: Map<string, StaticAsset> | null = null
  private loadPromise: Promise<void> | null = null
  private cache: DiskCache
  private coingeckoDecimalsCache = new LRUCache<string, { decimals: number | null }>({
    max: 1000,
    ttl: 1000 * 60 * 60 * 24,
  })

  private constructor() {
    this.cache = new DiskCache()
  }

  static getInstance(): AssetDataService {
    if (!AssetDataService.instance) {
      AssetDataService.instance = new AssetDataService()
    }
    return AssetDataService.instance
  }

  async ensureLoadedAsync(): Promise<void> {
    if (this.loadState === 'loaded') return

    if (this.loadState === 'loading') {
      await this.loadPromise
      return
    }

    this.loadState = 'loading'
    this.loadPromise = this.load()

    try {
      await this.loadPromise
      this.loadState = 'loaded'
    } catch (error) {
      console.warn('[AssetDataService] Load failed, using fallback data:', error)
      this.loadState = 'failed'
      this.loadFromFallback()
    }
  }

  getAsset(assetId: string): StaticAsset | undefined {
    const asset = this.assetData?.get(assetId)
    if (asset) return asset

    // Fallback to manual asset definitions
    return MANUAL_ASSETS[assetId.toLowerCase()]
  }

  async getAssetDecimals(assetId: string, useCoinGeckoFallback = true): Promise<number> {
    const mainAsset = this.assetData?.get(assetId)
    if (mainAsset) return mainAsset.precision

    const manualAsset = MANUAL_ASSETS[assetId.toLowerCase()]
    if (manualAsset) {
      console.log(`[AssetDataService] Using manual asset definition for ${assetId}`)
      return manualAsset.precision
    }

    // Try CoinGecko fallback for ERC20 tokens if enabled
    if (useCoinGeckoFallback) {
      const cgDecimals = await this.fetchDecimalsFromCoingecko(assetId)
      if (cgDecimals !== null) {
        console.log(`[AssetDataService] Got decimals from CoinGecko for ${assetId}: ${cgDecimals}`)
        return cgDecimals
      }
    }

    // Asset not in DB or CoinGecko, defaulting to 18 (standard for most ERC20s)
    return 18
  }

  private async fetchDecimalsFromCoingecko(assetId: string): Promise<number | null> {
    // Check cache first (stores both successes and failures)
    const cached = this.coingeckoDecimalsCache.get(assetId)
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
        this.coingeckoDecimalsCache.set(assetId, { decimals: null })
        return null
      }

      const data = (await response.json()) as {
        detail_platforms?: Record<string, { decimal_place?: number }>
      }
      const decimals = data.detail_platforms?.[platform]?.decimal_place

      if (typeof decimals === 'number') {
        console.log(`[AssetDataService] Got decimals from CoinGecko for ${assetId}: ${decimals}`)
        this.coingeckoDecimalsCache.set(assetId, { decimals })
        return decimals
      }

      this.coingeckoDecimalsCache.set(assetId, { decimals: null })
      return null
    } catch {
      // Cache errors to avoid retrying
      this.coingeckoDecimalsCache.set(assetId, { decimals: null })
      return null
    }
  }

  isLoaded(): boolean {
    return this.loadState === 'loaded'
  }

  async reload(): Promise<void> {
    this.loadState = 'uninitialized'
    this.assetData = null
    this.loadPromise = null
    await this.ensureLoadedAsync()
  }

  private async load(): Promise<void> {
    if (await this.loadFromCache()) {
      console.log('[AssetDataService] Loaded from cache')
      return
    }

    if (await this.loadFromNetwork()) {
      console.log('[AssetDataService] Loaded from network')
      return
    }

    console.warn('[AssetDataService] Using fallback defaults')
    this.loadFromFallback()
  }

  private async loadFromCache(): Promise<boolean> {
    const cachedData = await this.cache.get()
    if (!cachedData) return false

    const { assetData } = decodeAssetData(cachedData)
    this.assetData = new Map(Object.entries(assetData))
    return true
  }

  private async loadFromNetwork(): Promise<boolean> {
    try {
      const encodedData = await fetchAssetData()
      const { assetData } = decodeAssetData(encodedData)
      this.assetData = new Map(Object.entries(assetData))

      await this.cache.set(encodedData)
      return true
    } catch (error) {
      console.warn('[AssetDataService] Network fetch failed:', error)
      return false
    }
  }

  private loadFromFallback(): void {
    this.assetData = new Map()
  }
}

export { AssetDataService }
