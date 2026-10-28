import axios from 'axios'
import { LRUCache } from 'lru-cache'

import { createSemaphore } from '../utils/concurrency'
import { formatError } from '../utils/error'
import { withRetry } from '../utils/retry'

import * as coingeckoMappingService from './coingeckoMappingService'

const MARKET_CHART_URL = 'https://api.proxy.shapeshift.com/api/v1/markets/coins'

// CoinGecko only returns hourly points for ranges up to 90 days, so history is fetched in fixed buckets under that
export const BUCKET_SECONDS = 89 * 86400
// A point further than this from the requested time is a gap in CoinGecko's data, not a spot price
export const MAX_PRICE_DISTANCE_SECONDS = 6 * 3600
// The bucket containing now keeps gaining points, so it is refetched after this
const OPEN_BUCKET_TTL_MS = 1000 * 60 * 10

// [timestamp ms, usd]
export type PricePoint = [number, number]

// Closed buckets never change, so they are kept until evicted
const seriesCache = new LRUCache<string, PricePoint[]>({ max: 5000 })
const inflight = new Map<string, Promise<PricePoint[] | null>>()
const limit = createSemaphore(4)
const warnedUnmapped = new Set<string>()

const fetchSeries = async (coingeckoId: string, bucket: number): Promise<PricePoint[] | null> => {
  const key = `${coingeckoId}:${bucket}`
  const cached = seriesCache.get(key)
  if (cached) return cached

  const pending = inflight.get(key)
  if (pending) return pending

  const from = bucket * BUCKET_SECONDS
  const now = Math.floor(Date.now() / 1000)
  const isOpen = from + BUCKET_SECONDS > now
  const to = isOpen ? now : from + BUCKET_SECONDS

  const request = limit(() =>
    withRetry(`coingecko/market_chart/${coingeckoId}`, () =>
      axios.get<{ prices?: PricePoint[] }>(`${MARKET_CHART_URL}/${coingeckoId}/market_chart/range`, {
        params: { vs_currency: 'usd', from, to },
        timeout: 30_000,
      })
    )
  )
    .then(({ data }) => {
      const prices = (data.prices ?? []).filter(([, price]) => price > 0)
      seriesCache.set(key, prices, isOpen ? { ttl: OPEN_BUCKET_TTL_MS } : undefined)
      return prices
    })
    .catch(error => {
      // not cached, so the next request retries the bucket
      console.error(`[historicalPrices] Failed to fetch ${coingeckoId} ${from}-${to}: ${formatError(error)}`)
      return null
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, request)
  return request
}

// The point closest to the timestamp, or null when the nearest one is too far away to stand for it
export const findClosestPrice = (prices: PricePoint[], timestamp: number): number | null => {
  if (prices.length === 0) return null

  const targetMs = timestamp * 1000
  let lo = 0
  let hi = prices.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (prices[mid][0] < targetMs) lo = mid + 1
    else hi = mid
  }

  const candidates = [prices[lo], prices[lo - 1]].filter(Boolean)
  const closest = candidates.reduce((a, b) => (Math.abs(b[0] - targetMs) < Math.abs(a[0] - targetMs) ? b : a))

  return Math.abs(closest[0] - targetMs) <= MAX_PRICE_DISTANCE_SECONDS * 1000 ? closest[1] : null
}

// USD spot price of the asset at the timestamp (seconds), from CoinGecko's hourly history
export const getHistoricalPriceUsd = async (assetId: string, timestamp: number): Promise<number | null> => {
  await coingeckoMappingService.ensureLoadedAsync()

  const coingeckoId = coingeckoMappingService.getCoingeckoId(assetId)
  if (!coingeckoId) {
    if (!warnedUnmapped.has(assetId)) {
      warnedUnmapped.add(assetId)
      console.warn(`[historicalPrices] No CoinGecko mapping for ${assetId} - add to MANUAL_COINGECKO_MAPPINGS`)
    }
    return null
  }

  const series = await fetchSeries(coingeckoId, Math.floor(timestamp / BUCKET_SECONDS))
  return series ? findClosestPrice(series, timestamp) : null
}
