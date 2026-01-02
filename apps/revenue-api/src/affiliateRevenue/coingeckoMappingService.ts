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

// Module-level state
let loadState: LoadState = 'uninitialized'
let mappings: Map<string, string> | null = null
let loadPromise: Promise<void> | null = null

// Runtime validation helper for mapping data
const isValidMappingData = (data: unknown): data is Record<string, string> => {
  if (typeof data !== 'object' || data === null) return false

  return Object.entries(data).every(([key, value]) => typeof key === 'string' && typeof value === 'string')
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
    console.warn('[CoingeckoMappingService] Load failed, using empty fallback:', error)
    loadState = 'failed'
    loadFromFallback()
  }
}

export function getCoingeckoId(assetId: string): string | undefined {
  return mappings?.get(assetId)
}

export function isLoaded(): boolean {
  return loadState === 'loaded'
}

async function load(): Promise<void> {
  if (await loadFromCache()) {
    console.log('[CoingeckoMappingService] Loaded from cache')
    return
  }

  if (await loadFromNetwork()) {
    console.log('[CoingeckoMappingService] Loaded from network')
    return
  }

  console.warn('[CoingeckoMappingService] Using empty fallback')
  loadFromFallback()
}

async function loadFromCache(): Promise<boolean> {
  try {
    const content = await readFile(CACHE_FILE, 'utf-8')
    const cached: CachedMappings = JSON.parse(content)

    if (Date.now() > cached.expiresAt) {
      console.log('[CoingeckoMappingService] Cache expired')
      return false
    }

    mappings = new Map(Object.entries(cached.data))
    return true
  } catch (error) {
    console.warn('[CoingeckoMappingService] Failed to read cache:', (error as Error).message)
    return false
  }
}

async function loadFromNetwork(): Promise<boolean> {
  try {
    const loadedMappings: Record<string, string> = {}

    for (const chain of COINGECKO_CHAINS) {
      const url = `${GITHUB_BASE_URL}/${chain}/adapter.json`
      try {
        const response = await fetch(url)
        if (response.ok) {
          const rawData = await response.json()

          if (!isValidMappingData(rawData)) {
            console.warn(`[CoingeckoMappingService] Invalid mapping data from ${chain}`)
            continue
          }

          Object.assign(loadedMappings, rawData)
        } else {
          console.warn(`[CoingeckoMappingService] Failed to fetch ${chain}: ${response.status}`)
        }
      } catch (error) {
        console.warn(`[CoingeckoMappingService] Failed to fetch ${chain}:`, error)
      }
    }

    if (Object.keys(loadedMappings).length === 0) {
      console.warn('[CoingeckoMappingService] No mappings loaded from network')
      return false
    }

    mappings = new Map(Object.entries(loadedMappings))

    await saveToCache(loadedMappings)

    return true
  } catch (error) {
    console.warn('[CoingeckoMappingService] Network fetch failed:', error)
    return false
  }
}

async function saveToCache(data: Record<string, string>): Promise<void> {
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

function loadFromFallback(): void {
  mappings = new Map()
}
