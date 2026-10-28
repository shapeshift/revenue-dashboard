import axios from 'axios'
import { describe, expect, spyOn, test } from 'bun:test'

import * as coingeckoMappingService from './coingeckoMappingService'
import type { PricePoint } from './historicalPrices'
import { findClosestPrice, getHistoricalPriceUsd, MAX_PRICE_DISTANCE_SECONDS } from './historicalPrices'

const HOUR = 3600
const series: PricePoint[] = [
  [1_000 * HOUR * 1000, 10],
  [1_001 * HOUR * 1000, 11],
  [1_002 * HOUR * 1000, 12],
]

describe('findClosestPrice', () => {
  test('picks the nearest point on either side', () => {
    expect(findClosestPrice(series, 1_001 * HOUR - 600)).toBe(11)
    expect(findClosestPrice(series, 1_001 * HOUR + 600)).toBe(11)
    expect(findClosestPrice(series, 1_001 * HOUR + 1_900)).toBe(12)
  })

  test('uses the edge points just outside the series', () => {
    expect(findClosestPrice(series, 1_000 * HOUR - 60)).toBe(10)
    expect(findClosestPrice(series, 1_002 * HOUR + 60)).toBe(12)
  })

  // a gap in CoinGecko's data must not stand in for the spot price
  test('returns null when the nearest point is too far away', () => {
    expect(findClosestPrice(series, 1_002 * HOUR + MAX_PRICE_DISTANCE_SECONDS + 1)).toBeNull()
    expect(findClosestPrice([], 1_000 * HOUR)).toBeNull()
  })
})

describe('getHistoricalPriceUsd', () => {
  spyOn(coingeckoMappingService, 'ensureLoadedAsync').mockResolvedValue()
  spyOn(coingeckoMappingService, 'getCoingeckoId').mockImplementation(assetId => assetId)

  // a 400 isn't retried, so the failure surfaces without backoff delays
  const failOnce = () =>
    spyOn(axios, 'get').mockRejectedValueOnce(
      Object.assign(new Error('bad'), { isAxiosError: true, response: { status: 400 } })
    )

  test('remembers a failed fetch instead of refetching it for every caller', async () => {
    const get = failOnce()
    expect(await getHistoricalPriceUsd('coin-a', 1_000 * HOUR)).toBeNull()
    expect(await getHistoricalPriceUsd('coin-a', 1_001 * HOUR)).toBeNull()
    expect(get).toHaveBeenCalledTimes(1)
    get.mockRestore()
  })

  test('throwOnFetchError turns a failed fetch into an error', async () => {
    const get = failOnce()
    const error = await getHistoricalPriceUsd('coin-b', 1_000 * HOUR, { throwOnFetchError: true }).catch(
      (e: unknown) => e
    )
    expect(error).toBeInstanceOf(Error)
    get.mockRestore()
  })

  test('a gap in a fetched series is no price, not an error', async () => {
    const get = spyOn(axios, 'get').mockResolvedValueOnce({ data: { prices: [] } })
    expect(await getHistoricalPriceUsd('coin-c', 1_000 * HOUR, { throwOnFetchError: true })).toBeNull()
    get.mockRestore()
  })
})
