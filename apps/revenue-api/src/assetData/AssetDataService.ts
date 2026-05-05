import { ASSET_OVERRIDES } from './overrides'
import type { Asset } from './types'
import { fetchAssetData, fetchCoingeckoAsset } from './utils'

export class AssetDataService {
  private assetData = new Map<string, Asset>()

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

  async getAsset(assetId: string): Promise<Asset | undefined> {
    const existing = this.assetData.get(assetId)
    if (existing) return existing

    const asset = await fetchCoingeckoAsset(assetId)
    if (asset) {
      this.assetData.set(assetId, asset)
      return asset
    }

    console.warn(`[AssetDataService] Asset not found: ${assetId}`)
  }
}

export const assetDataService = await AssetDataService.initialize()
