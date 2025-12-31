import axios from 'axios'
import { LRUCache } from 'lru-cache'

import { withRetry } from '../utils/retry'

const PRICE_CACHE_TTL = 1000 * 60 * 10
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY

// Use CoinGecko directly when API key is available, otherwise use proxy
const PRICE_API_BASE = COINGECKO_API_KEY
  ? 'https://api.coingecko.com/api/v3'
  : 'https://api.proxy.shapeshift.com/api/v1/markets'

const PRICE_API_URL = `${PRICE_API_BASE}/simple/price`

const getHeaders = () => {
  const headers: Record<string, string> = {}
  if (COINGECKO_API_KEY) {
    headers['x-cg-pro-api-key'] = COINGECKO_API_KEY
  }
  return headers
}

export const priceCache = new LRUCache<string, number>({
  max: 1000,
  ttl: PRICE_CACHE_TTL,
  updateAgeOnGet: true,
})

const loggedPriceFailures = new Set<string>()

const NATIVE_TOKEN_COIN_IDS: Record<string, string> = {
  thorchain: 'thorchain',
  mayachain: 'cacao',
  'eip155:1': 'ethereum',
  'eip155:10': 'ethereum',
  'eip155:137': 'matic-network',
  'eip155:56': 'binancecoin',
  'eip155:100': 'xdai',
  'eip155:8453': 'ethereum',
  'eip155:42161': 'ethereum',
  'eip155:43114': 'avalanche-2',
  'bip122:000000000019d6689c085ae165831e93': 'bitcoin',
  'bip122:000000000933ea01ad0ee984209779ba': 'bitcoin-cash',
  'bip122:00000000001a91e3dace36e2be3bf030': 'dogecoin',
  'bip122:12a765e31ffd4059bada1e25190f6e98': 'litecoin',
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 'solana',
  'tron:0x2b6653dc': 'tron',
}

const CHAIN_TO_COINGECKO_PLATFORM: Record<string, string> = {
  'eip155:1': 'ethereum',
  'eip155:10': 'optimistic-ethereum',
  'eip155:137': 'polygon-pos',
  'eip155:56': 'binance-smart-chain',
  'eip155:100': 'xdai',
  'eip155:8453': 'base',
  'eip155:42161': 'arbitrum-one',
  'eip155:43114': 'avalanche',
}

export const getAssetPriceUsd = async (assetId: string): Promise<number | null> => {
  const cacheKey = `price:${assetId}`
  const cached = priceCache.get(cacheKey)
  if (cached !== undefined) return cached

  const price = await fetchPriceForAsset(assetId)
  if (price !== null) {
    priceCache.set(cacheKey, price)
  }
  return price
}

export const getBulkAssetPrices = async (assetIds: string[]): Promise<Map<string, number | null>> => {
  const results = new Map<string, number | null>()
  const uncachedIds: string[] = []

  // 1. Check cache first
  for (const assetId of assetIds) {
    const cached = priceCache.get(`price:${assetId}`)
    if (cached !== undefined) {
      results.set(assetId, cached)
    } else {
      uncachedIds.push(assetId)
    }
  }

  if (uncachedIds.length === 0) return results

  // 2. Group by type (native vs contract tokens)
  const nativeTokens = uncachedIds.filter(id => id.split('/')[1]?.startsWith('slip44:'))
  const contractTokens = uncachedIds.filter(id => !id.split('/')[1]?.startsWith('slip44:'))

  // 3. Fetch native tokens in bulk (batches of 100)
  if (nativeTokens.length > 0) {
    const coinIdMap = new Map<string, string>()
    nativeTokens.forEach(assetId => {
      const chainId = assetId.split('/')[0]
      const coinId = NATIVE_TOKEN_COIN_IDS[chainId]
      if (coinId) {
        coinIdMap.set(assetId, coinId)
      }
    })

    const uniqueCoinIds = Array.from(new Set(coinIdMap.values()))

    // Batch into chunks of 100
    for (let i = 0; i < uniqueCoinIds.length; i += 100) {
      const batch = uniqueCoinIds.slice(i, i + 100)

      try {
        const { data } = await withRetry(() =>
          axios.get<Record<string, { usd?: number }>>(PRICE_API_URL, {
            params: { vs_currencies: 'usd', ids: batch.join(',') },
            headers: getHeaders(),
            timeout: 10000,
          })
        )

        // Map results back to assetIds
        nativeTokens.forEach(assetId => {
          const coinId = coinIdMap.get(assetId)
          if (coinId) {
            const price = data[coinId]?.usd ?? null
            results.set(assetId, price)
            if (price !== null) {
              priceCache.set(`price:${assetId}`, price)
            }
          }
        })
      } catch (error) {
        console.warn(`[PriceCache] Bulk fetch failed for batch starting at index ${i}:`, error)
        // Continue to individual fetches
      }
    }
  }

  // 4. Fetch contract tokens individually (CoinGecko limitation)
  await Promise.all(
    contractTokens.map(async assetId => {
      const price = await fetchPriceForAsset(assetId)
      results.set(assetId, price)
      if (price !== null) {
        priceCache.set(`price:${assetId}`, price)
      }
    })
  )

  return results
}

const fetchPriceForAsset = async (assetId: string): Promise<number | null> => {
  const [chainId, assetPart] = assetId.split('/')

  if (!assetPart) {
    console.warn(`[priceCache] Invalid assetId format: ${assetId}`)
    return null
  }

  if (assetPart.startsWith('slip44:')) {
    return fetchNativeTokenPrice(chainId)
  }

  if (assetPart.startsWith('erc20:')) {
    const tokenAddress = assetPart.replace('erc20:', '')
    return fetchErc20TokenPrice(chainId, tokenAddress)
  }

  if (assetPart.startsWith('nep141:')) {
    return fetchNearTokenPrice(assetPart.replace('nep141:', ''))
  }

  if (assetPart.startsWith('spl:')) {
    return fetchSolanaTokenPrice(assetPart.replace('spl:', ''))
  }

  if (!loggedPriceFailures.has(assetId)) {
    loggedPriceFailures.add(assetId)
    console.warn(`[priceCache] Unsupported asset type: ${assetId}`)
  }
  return null
}

const fetchNativeTokenPrice = async (chainId: string): Promise<number | null> => {
  const coinId = NATIVE_TOKEN_COIN_IDS[chainId]
  if (!coinId) {
    if (!loggedPriceFailures.has(`native:${chainId}`)) {
      loggedPriceFailures.add(`native:${chainId}`)
      console.warn(`[priceCache] No CoinGecko ID mapping for chain: ${chainId}`)
    }
    return null
  }

  const { data } = await withRetry(() =>
    axios.get<Record<string, { usd?: number }>>(PRICE_API_URL, {
      params: {
        vs_currencies: 'usd',
        ids: coinId,
      },
      headers: getHeaders(),
      timeout: 10000,
    })
  )

  const price = data[coinId]?.usd
  return price !== undefined ? price : null
}

const fetchErc20TokenPrice = async (chainId: string, tokenAddress: string): Promise<number | null> => {
  const platform = CHAIN_TO_COINGECKO_PLATFORM[chainId]
  if (!platform) {
    if (!loggedPriceFailures.has(`platform:${chainId}`)) {
      loggedPriceFailures.add(`platform:${chainId}`)
      console.warn(`[priceCache] No CoinGecko platform mapping for chain: ${chainId}`)
    }
    return null
  }

  try {
    const { data } = await withRetry(() =>
      axios.get<{ market_data?: { current_price?: { usd?: number } } }>(
        `${PRICE_API_BASE}/coins/${platform}/contract/${tokenAddress}`,
        { headers: getHeaders(), timeout: 10000 }
      )
    )

    const price = data.market_data?.current_price?.usd
    return price !== undefined ? price : null
  } catch (error) {
    const assetKey = `${chainId}/${tokenAddress}`
    if (!loggedPriceFailures.has(assetKey)) {
      loggedPriceFailures.add(assetKey)
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.warn(`[priceCache] Price unavailable for ${assetKey}: ${errorMsg}`)
    }
    return null
  }
}

const fetchNearTokenPrice = async (tokenId: string): Promise<number | null> => {
  const NEAR_TOKEN_MAP: Record<string, string> = {
    wrap: 'wrapped-near',
    'usdt.tether-token': 'tether',
    'usdc.e2e015d1.c5d93f99': 'usd-coin',
  }

  const coinId = NEAR_TOKEN_MAP[tokenId]
  if (!coinId) {
    if (!loggedPriceFailures.has(`near:${tokenId}`)) {
      loggedPriceFailures.add(`near:${tokenId}`)
      console.warn(`[priceCache] No CoinGecko mapping for NEAR token: ${tokenId}`)
    }
    return null
  }

  const { data } = await withRetry(() =>
    axios.get<Record<string, { usd?: number }>>(PRICE_API_URL, {
      params: {
        vs_currencies: 'usd',
        ids: coinId,
      },
      headers: getHeaders(),
      timeout: 10000,
    })
  )

  const price = data[coinId]?.usd
  return price !== undefined ? price : null
}

const fetchSolanaTokenPrice = async (tokenAddress: string): Promise<number | null> => {
  try {
    const { data } = await withRetry(() =>
      axios.get<{ market_data?: { current_price?: { usd?: number } } }>(
        `${PRICE_API_BASE}/coins/solana/contract/${tokenAddress}`,
        { headers: getHeaders(), timeout: 10000 }
      )
    )

    const price = data.market_data?.current_price?.usd
    return price !== undefined ? price : null
  } catch (error) {
    const assetKey = `solana/${tokenAddress}`
    if (!loggedPriceFailures.has(assetKey)) {
      loggedPriceFailures.add(assetKey)
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.warn(`[priceCache] Price unavailable for ${assetKey}: ${errorMsg}`)
    }
    return null
  }
}
