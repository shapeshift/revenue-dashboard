import { LRUCache } from 'lru-cache'

import type { AffiliateRevenueResponse } from '../types'
import { registerGauge } from '../utils/diagnostics'

export const createRevenueCache = () => {
  const cache = new LRUCache<string, AffiliateRevenueResponse>({ max: 100, ttl: 60_000 })
  const pending = new Map<string, { request: Promise<AffiliateRevenueResponse>; startedAt: number }>()

  registerGauge('revenueCache', () => ({ cached: cache.size, pending: pending.size }))

  return (start: number, end: number, fetchRevenue: () => Promise<AffiliateRevenueResponse>) => {
    const key = `${start}:${end}`
    const cached = cache.get(key)
    if (cached) {
      console.log(`[RevenueCache] hit ${key}`)
      return Promise.resolve(cached)
    }

    const inflight = pending.get(key)
    if (inflight) {
      console.log(`[RevenueCache] joined ${key}, running for ${Date.now() - inflight.startedAt}ms`)
      return inflight.request
    }

    const request = Promise.resolve()
      .then(fetchRevenue)
      .then(response => {
        if (response.failedProviders.length === 0) cache.set(key, response)
        return response
      })
      .finally(() => pending.delete(key))
    pending.set(key, { request, startedAt: Date.now() })
    return request
  }
}
