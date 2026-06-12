import { ASSET_OVERRIDES } from './overrides'
import type { Asset } from './types'
import { fetchAssetData, fetchCoingeckoAsset } from './utils'

export class AssetDataService {
  private assetData = new Map<string, Asset>()
  private loggedMisses = new Set<string>()

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

  async getAsset(assetId: string): Promise<Asset | undefined> {
    const existing = this.assetData.get(assetId)
    if (existing) return existing

    try {
      const asset = await fetchCoingeckoAsset(assetId)
      if (!asset) {
        this.warnOncePerRequest(`[AssetDataService] Asset not found: ${assetId}`, assetId)
        return
      }

      this.assetData.set(assetId, asset)
      return asset
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.warnOncePerRequest(`[AssetDataService] Asset not fetched from CoinGecko: ${assetId} (${message})`, assetId)
    }
  }
}

export const assetDataService = await AssetDataService.initialize()
