import { readFile, writeFile } from 'node:fs/promises'

import type { EncodedAssetData } from './types'

interface CachedAssetData {
  data: EncodedAssetData
  timestamp: number
  expiresAt: number
}

const CACHE_FILE = '/tmp/shapeshift-revenue-asset-cache.json'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

export class DiskCache {
  async get(): Promise<EncodedAssetData | null> {
    try {
      const content = await readFile(CACHE_FILE, 'utf-8')
      const cached: CachedAssetData = JSON.parse(content)

      if (this.isExpired(cached)) {
        console.log('[AssetDataCache] Cache expired')
        return null
      }

      return cached.data
    } catch (error) {
      console.warn('[AssetDataCache] Failed to read cache:', (error as Error).message)
      return null
    }
  }

  async set(data: EncodedAssetData): Promise<void> {
    const cached: CachedAssetData = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + TTL_MS,
    }

    try {
      await writeFile(CACHE_FILE, JSON.stringify(cached))
      console.log('[AssetDataCache] Saved to cache:', CACHE_FILE)
    } catch (error) {
      console.warn('[AssetDataCache] Failed to write cache:', (error as Error).message)
    }
  }

  async clear(): Promise<void> {
    try {
      await writeFile(CACHE_FILE, '')
      console.log('[AssetDataCache] Cache cleared')
    } catch (error) {
      console.warn('[AssetDataCache] Failed to clear cache:', (error as Error).message)
    }
  }

  private isExpired(cached: CachedAssetData): boolean {
    return Date.now() > cached.expiresAt
  }
}
