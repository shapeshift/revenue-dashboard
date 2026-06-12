import { readFile, writeFile } from 'node:fs/promises'

// NEAR Intents' official token registry — maps intents asset ids (nep141/nep245/1cs)
// to the underlying blockchain and canonical contract address. The omft/HOT bridge
// suffixes are hashes of the token id, not the id itself, so this registry is the
// only way to resolve non-EVM tokens to canonical assetIds.
const TOKENS_URL = 'https://1click.chaindefuser.com/v0/tokens'

const CACHE_FILE = '/tmp/shapeshift-revenue-nearintents-tokens.json'
const CACHE_TTL_MS = 1 * 24 * 60 * 60 * 1000 // 1 day

export interface RegistryToken {
  assetId: string
  blockchain: string
  symbol: string
  decimals: number
  contractAddress?: string // absent for native assets
}

interface CachedTokens {
  data: RegistryToken[]
  expiresAt: number
}

type LoadState = 'uninitialized' | 'loading' | 'loaded' | 'failed'

let loadState: LoadState = 'uninitialized'
let tokens: Map<string, RegistryToken> | null = null
let loadPromise: Promise<void> | null = null

const isValidTokenData = (data: unknown): data is RegistryToken[] =>
  Array.isArray(data) &&
  data.every(
    t => typeof t === 'object' && t !== null && typeof t.assetId === 'string' && typeof t.blockchain === 'string'
  )

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
    console.warn('[NearIntentsTokenRegistry] Load failed, parser falls back to heuristics:', error)
    loadState = 'failed'
    tokens = new Map()
  }
}

export function getRegistryToken(assetId: string): RegistryToken | undefined {
  return tokens?.get(assetId)
}

async function load(): Promise<void> {
  if (await loadFromCache()) {
    console.log('[NearIntentsTokenRegistry] Loaded from cache')
    return
  }

  await loadFromNetwork()
  console.log('[NearIntentsTokenRegistry] Loaded from network')
}

async function loadFromCache(): Promise<boolean> {
  try {
    const content = await readFile(CACHE_FILE, 'utf-8')
    const cached: CachedTokens = JSON.parse(content)

    if (Date.now() > cached.expiresAt || !isValidTokenData(cached.data)) return false

    tokens = new Map(cached.data.map(t => [t.assetId, t]))
    return true
  } catch {
    return false
  }
}

async function loadFromNetwork(): Promise<void> {
  const response = await fetch(TOKENS_URL)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const data = await response.json()
  if (!isValidTokenData(data)) throw new Error('Invalid token data shape')

  tokens = new Map(data.map(t => [t.assetId, t]))

  try {
    const cached: CachedTokens = { data, expiresAt: Date.now() + CACHE_TTL_MS }
    await writeFile(CACHE_FILE, JSON.stringify(cached))
  } catch (error) {
    console.warn('[NearIntentsTokenRegistry] Failed to write cache:', (error as Error).message)
  }
}
