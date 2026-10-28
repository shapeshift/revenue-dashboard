import { describe, expect, test } from 'bun:test'

import type { PricePoint } from './historicalPrices'
import { findClosestPrice, MAX_PRICE_DISTANCE_SECONDS } from './historicalPrices'

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
