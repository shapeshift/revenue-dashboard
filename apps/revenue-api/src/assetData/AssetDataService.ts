import { LRUCache } from 'lru-cache'

import { ASSET_OVERRIDES } from './overrides'
import type { Asset } from './types'
import { fetchAssetData, fetchCoingeckoAsset } from './utils'

const NOT_FOUND_TTL_MS = 1000 * 60 * 60
const FAILED_LOOKUP_TTL_MS = 1000 * 60

export class AssetDataService {
  private assetData = new Map<string, Asset>()
  private loggedMisses = new Set<string>()
  private misses = new LRUCache<string, string>({ max: 5000 })
  private lookups = new Map<string, Promise<Asset | undefined>>()

  static async initialize(): Promise<AssetDataService> {
    const service = new AssetDataService()

    try {
      const assetData = await fetchAssetData()
      service.assetData = new Map(Object.entries(assetData))
      console.log(`[AssetDataService] Initialization succeeded (${service.assetData.size} assets)`)
    } catch (error) {
      console.warn(`[AssetDataService] Initialization failed: ${error}`)
    }

    for (const [assetId, asset] of Object.entries(ASSET_OVERRIDES)) {
      service.assetData.set(assetId, asset)
    }

    return service
  }

  // Clears the miss log so each missing asset is warned once per request
  resetMissLog(): void {
    this.loggedMisses.clear()
  }

  private warnOncePerRequest(message: string, assetId: string): void {
    if (this.loggedMisses.has(assetId)) return
    this.loggedMisses.add(assetId)
    console.warn(message)
  }

  // For assets a tracker resolves on chain that neither the asset DB nor CoinGecko know
  registerAsset(asset: Asset): void {
    this.assetData.set(asset.assetId, asset)
  }

  private recordMiss(assetId: string, message: string, ttl: number): void {
    this.misses.set(assetId, message, { ttl })
    this.warnOncePerRequest(message, assetId)
  }

  private async lookup(assetId: string): Promise<Asset | undefined> {
    try {
      const asset = await fetchCoingeckoAsset(assetId)
      if (!asset) {
        this.recordMiss(assetId, `[AssetDataService] Asset not found: ${assetId}`, NOT_FOUND_TTL_MS)
        return
      }

      this.assetData.set(assetId, asset)
      return asset
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.recordMiss(
        assetId,
        `[AssetDataService] Asset not fetched from CoinGecko: ${assetId} (${message})`,
        FAILED_LOOKUP_TTL_MS
      )
    }
  }

  async getAsset(assetId: string): Promise<Asset | undefined> {
    const existing = this.assetData.get(assetId)
    if (existing) return existing

    const miss = this.misses.get(assetId)
    if (miss) {
      this.warnOncePerRequest(miss, assetId)
      return
    }

    const running = this.lookups.get(assetId)
    if (running) return running

    const lookup = this.lookup(assetId).finally(() => this.lookups.delete(assetId))
    this.lookups.set(assetId, lookup)
    return lookup
  }
}

export const assetDataService = await AssetDataService.initialize()
