import { describe, expect, mock, test } from 'bun:test'

import type { AffiliateRevenueResponse } from '../types'

import { aggregateAffiliateRevenue } from './aggregateRevenue'
import { createRevenueCache } from './revenueCache'

const response = await aggregateAffiliateRevenue([], [], () => Promise.resolve(undefined))

describe('aggregate revenue cache', () => {
  test('coalesces simultaneous monthly requests and caches complete zero totals', async () => {
    const cached = createRevenueCache()
    const fetch = mock(() => Promise.resolve(response))
    const first = cached(1, 31, fetch)
    const second = cached(1, 31, fetch)
    expect(first).toBe(second)
    expect(await first).toEqual(response)
    expect(await cached(1, 31, fetch)).toEqual(response)
    expect(fetch).toHaveBeenCalledTimes(1)
    await cached(2, 31, fetch)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  test('retries failed requests rather than remembering a rejected promise', async () => {
    const cached = createRevenueCache()
    const fail = mock(() => Promise.reject(new Error('upstream timeout')))
    const error = await cached(1, 31, fail).catch((error: unknown) => error)
    expect(error).toEqual(new Error('upstream timeout'))
    expect(await cached(1, 31, () => Promise.resolve(response))).toEqual(response)
  })

  test('does not cache incomplete revenue', async () => {
    const cached = createRevenueCache()
    const partial = { ...response, failedProviders: ['mayachain'] as AffiliateRevenueResponse['failedProviders'] }
    expect(await cached(1, 31, () => Promise.resolve(partial))).toEqual(partial)
    expect(await cached(1, 31, () => Promise.resolve(response))).toEqual(response)
  })
})
