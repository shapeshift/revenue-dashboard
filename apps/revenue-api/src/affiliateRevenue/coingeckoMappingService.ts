import { readFile, writeFile } from 'node:fs/promises'

const GITHUB_BASE_URL =
  'https://raw.githubusercontent.com/shapeshift/web/develop/packages/caip/src/adapters/coingecko/generated'

const CACHE_FILE = '/tmp/shapeshift-revenue-coingecko-mappings.json'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const COINGECKO_CHAINS = [
  'cosmos_thorchain-1',
  'cosmos_mayachain-mainnet-v1',
  'eip155_1',
  'eip155_10',
  'eip155_56',
  'eip155_100',
  'eip155_137',
  'eip155_8453',
  'eip155_42161',
  'eip155_43114',
  'solana_5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
]

interface CachedMappings {
  data: Record<string, string>
  timestamp: number
  expiresAt: number
}

type LoadState = 'uninitialized' | 'loading' | 'loaded' | 'failed'

class CoingeckoMappingService {
  private static instance: CoingeckoMappingService
  private loadState: LoadState = 'uninitialized'
  private mappings: Map<string, string> | null = null
  private loadPromise: Promise<void> | null = null

  private constructor() {}

  static getInstance(): CoingeckoMappingService {
    if (!CoingeckoMappingService.instance) {
      CoingeckoMappingService.instance = new CoingeckoMappingService()
    }
    return CoingeckoMappingService.instance
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
      console.warn('[CoingeckoMappingService] Load failed, using empty fallback:', error)
      this.loadState = 'failed'
      this.loadFromFallback()
    }
  }

  getCoingeckoId(assetId: string): string | undefined {
    return this.mappings?.get(assetId)
  }

  isLoaded(): boolean {
    return this.loadState === 'loaded'
  }

  private async load(): Promise<void> {
    if (await this.loadFromCache()) {
      console.log('[CoingeckoMappingService] Loaded from cache')
      return
    }

    if (await this.loadFromNetwork()) {
      console.log('[CoingeckoMappingService] Loaded from network')
      return
    }

    console.warn('[CoingeckoMappingService] Using empty fallback')
    this.loadFromFallback()
  }

  private async loadFromCache(): Promise<boolean> {
    try {
      const content = await readFile(CACHE_FILE, 'utf-8')
      const cached: CachedMappings = JSON.parse(content)

      if (Date.now() > cached.expiresAt) {
        console.log('[CoingeckoMappingService] Cache expired')
        return false
      }

      this.mappings = new Map(Object.entries(cached.data))
      return true
    } catch (error) {
      console.warn('[CoingeckoMappingService] Failed to read cache:', (error as Error).message)
      return false
    }
  }

  private async loadFromNetwork(): Promise<boolean> {
    try {
      const mappings: Record<string, string> = {}

      for (const chain of COINGECKO_CHAINS) {
        const url = `${GITHUB_BASE_URL}/${chain}/adapter.json`
        try {
          const response = await fetch(url)
          if (response.ok) {
            const data = (await response.json()) as Record<string, string>
            Object.assign(mappings, data)
          } else {
            console.warn(`[CoingeckoMappingService] Failed to fetch ${chain}: ${response.status}`)
          }
        } catch (error) {
          console.warn(`[CoingeckoMappingService] Failed to fetch ${chain}:`, error)
        }
      }

      if (Object.keys(mappings).length === 0) {
        console.warn('[CoingeckoMappingService] No mappings loaded from network')
        return false
      }

      this.mappings = new Map(Object.entries(mappings))

      await this.saveToCache(mappings)

      return true
    } catch (error) {
      console.warn('[CoingeckoMappingService] Network fetch failed:', error)
      return false
    }
  }

  private async saveToCache(data: Record<string, string>): Promise<void> {
    const cached: CachedMappings = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    }

    try {
      await writeFile(CACHE_FILE, JSON.stringify(cached))
      console.log('[CoingeckoMappingService] Saved to cache:', CACHE_FILE)
    } catch (error) {
      console.warn('[CoingeckoMappingService] Failed to write cache:', (error as Error).message)
    }
  }

  private loadFromFallback(): void {
    this.mappings = new Map()
  }
}

export const coingeckoMappingService = CoingeckoMappingService.getInstance()
