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

  getAssetDecimals(assetId: string): number {
    const mainAsset = this.assetData?.get(assetId)
    if (mainAsset) return mainAsset.precision

    const manualAsset = MANUAL_ASSETS[assetId.toLowerCase()]
    if (manualAsset) {
      console.log(`[AssetDataService] Using manual asset definition for ${assetId}`)
      return manualAsset.precision
    }

    console.warn(`[AssetDataService] Asset not found: ${assetId}, defaulting to 18 decimals`)
    return 18
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
