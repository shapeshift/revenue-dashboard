import { readFile, writeFile } from 'node:fs/promises'

import { MANUAL_COINGECKO_MAPPINGS } from './manualCoingeckoMappings'

const GITHUB_BASE_URL =
  'https://raw.githubusercontent.com/shapeshift/web/develop/packages/caip/src/adapters/coingecko/generated'

const CACHE_FILE = '/tmp/shapeshift-revenue-coingecko-mappings.json'
const CACHE_TTL_MS = 1 * 24 * 60 * 60 * 1000 // 1 day

const COINGECKO_CHAINS = [
  'bip122_000000000000000000651ef99cb9fcbe',
  'bip122_000000000019d6689c085ae165831e93',
  'bip122_00000000001a91e3dace36e2be3bf030',
  'bip122_00040fe8ec8471911baa1db1266ea15d',
  'bip122_12a765e31ffd4059bada1e25190f6e98',
  'cosmos_cosmoshub-4',
  'cosmos_mayachain-mainnet-v1',
  'cosmos_thorchain-1',
  'eip155_1',
  'eip155_10',
  'eip155_100',
  'eip155_130',
  'eip155_1329',
  'eip155_137',
  'eip155_143',
  'eip155_146',
  'eip155_1514',
  'eip155_1868',
  'eip155_25',
  'eip155_2741',
  'eip155_324',
  'eip155_34443',
  'eip155_42161',
  'eip155_42220',
  'eip155_43111',
  'eip155_43114',
  'eip155_4326',
  'eip155_480',
  'eip155_5000',
  'eip155_534352',
  'eip155_56',
  'eip155_57073',
  'eip155_59144',
  'eip155_60808',
  'eip155_747',
  'eip155_747474',
  'eip155_80094',
  'eip155_81457',
  'eip155_8453',
  'eip155_9745',
  'eip155_98866',
  'eip155_999',
  'near_mainnet',
  'solana_5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'starknet_SN_MAIN',
  'sui_35834a8a',
  'ton_mainnet',
  'tron_0x2b6653dc',
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
  // First try the loaded mappings from GitHub
  const mappedId = mappings?.get(assetId)
  if (mappedId) return mappedId

  // Fallback: Check manual mappings for assets not in GitHub (e.g., new tokens, 1:1 pegs)
  return MANUAL_COINGECKO_MAPPINGS[assetId]
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
