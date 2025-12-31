import axios from 'axios'

import { decodeAssetData } from './assetDataDecoder'
import type { EncodedAssetData, StaticAsset } from './assetDataTypes'

class AssetDataService {
  private assetData: Record<string, StaticAsset> | null = null
  private lastFetch: number | null = null
  private failureLogged = false
  private loadPromise: Promise<void> | null = null
  private readonly cacheTTL = 1000 * 60 * 60 * 24 * 7 // 1 week
  private readonly sourceUrl =
    'https://raw.githubusercontent.com/shapeshift/agentic-chat/main/packages/utils/src/assetData/encodedAssetData.json'

  private async ensureLoaded(): Promise<void> {
    const now = Date.now()

    if (this.assetData && this.lastFetch && now - this.lastFetch < this.cacheTTL) {
      return
    }

    if (this.loadPromise) {
      return this.loadPromise
    }

    this.loadPromise = this._doLoad()

    try {
      await this.loadPromise
    } finally {
      this.loadPromise = null
    }
  }

  private async _doLoad(): Promise<void> {
    const start = Date.now()

    if (!this.failureLogged) {
      console.log('[AssetDataService] Downloading asset database...')
    }

    try {
      const { data } = await axios.get<EncodedAssetData>(this.sourceUrl, { timeout: 30000 })
      this.assetData = decodeAssetData(data)
      this.lastFetch = Date.now()
      this.failureLogged = false

      const duration = Date.now() - start
      const count = Object.keys(this.assetData).length
      console.log(`[AssetDataService] Loaded ${count} assets in ${duration}ms`)
    } catch (error) {
      if (!this.failureLogged) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.warn(`[AssetDataService] Failed to load asset database: ${errorMsg}. Using fallback decimals.`)
        this.failureLogged = true
      }
    }
  }

  async ensureLoadedAsync(): Promise<void> {
    await this.ensureLoaded()
  }

  getAsset(assetId: string): StaticAsset {
    if (!this.assetData) {
      console.warn(`[AssetDataService] Asset data not loaded, using default for ${assetId}`)
      return { assetId, chainId: '', precision: 18, symbol: '', name: '' }
    }

    const asset = this.assetData[assetId]
    if (!asset) {
      console.warn(`[AssetDataService] Asset not found in database: ${assetId}. Using default 18 decimals.`)
      return { assetId, chainId: '', precision: 18, symbol: '', name: '' }
    }

    return asset
  }

  getAssetDecimals(assetId: string): number {
    const asset = this.getAsset(assetId)
    return asset.precision
  }
}

export const assetDataService = new AssetDataService()
