import { LRUCache } from 'lru-cache'

import type { AffiliateRevenueResponse } from '../types'

export const createRevenueCache = () => {
  const cache = new LRUCache<string, AffiliateRevenueResponse>({ max: 100, ttl: 60_000 })
  const pending = new Map<string, Promise<AffiliateRevenueResponse>>()

  return (start: number, end: number, fetchRevenue: () => Promise<AffiliateRevenueResponse>) => {
    const key = `${start}:${end}`
    const cached = cache.get(key)
    if (cached) return Promise.resolve(cached)

    const inflight = pending.get(key)
    if (inflight) return inflight

    const request = Promise.resolve()
      .then(fetchRevenue)
      .then(response => {
        if (response.failedProviders.length === 0) cache.set(key, response)
        return response
      })
      .finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
}
