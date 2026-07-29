import type { Service } from '../../types'
import {
  getCacheableThreshold,
  getDateEndTimestamp,
  getDateStartTimestamp,
  groupFeesByDate,
  saveCachedFees,
  splitDateRange,
  tryGetCachedFees,
} from '../cache'
import type { Fees } from '../types'

export type CachedFeesResult = {
  fees: Fees[]
  cacheHits: number
  cacheMisses: number
}

/**
 * Serve a service+chain's fees for a window from the per-day cache, fetching
 * only the days we're missing.
 *
 * Settled days never change, so they're cached forever; the trailing
 * not-yet-final window (see `getCacheableThreshold`) is always refetched.
 * `fetchRange` is called at most twice: once for the contiguous span of missing
 * cacheable days, once for the recent window.
 */
export const getCachedFees = async (
  service: Service,
  chainId: string,
  startTimestamp: number,
  endTimestamp: number,
  fetchRange: (start: number, end: number) => Promise<Fees[]>
): Promise<CachedFeesResult> => {
  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const cacheLookups = cacheableDates.map(date => ({ date, cached: tryGetCachedFees(service, chainId, date) }))
  const cachedFees = cacheLookups.flatMap(({ cached }) => cached ?? [])
  const datesToFetch = cacheLookups.filter(({ cached }) => !cached).map(({ date }) => date)

  // The two windows are disjoint and independent, so fetch them concurrently —
  // on a cold cache that halves the wall-clock of a paginated on-chain scan.
  const [newFees, recentFees] = await Promise.all([
    (async () => {
      if (datesToFetch.length === 0) return []

      const fetchStart = getDateStartTimestamp(datesToFetch[0])
      const fetchEnd = getDateEndTimestamp(datesToFetch[datesToFetch.length - 1])
      const fetched = await fetchRange(fetchStart, fetchEnd)

      // Cache every requested date, including the ones with no fees — an empty
      // day is a real answer, and not storing it means refetching it forever.
      const feesByDate = groupFeesByDate(fetched)
      for (const date of datesToFetch) {
        saveCachedFees(service, chainId, date, feesByDate[date] || [])
      }

      return fetched
    })(),
    recentStart === null ? Promise.resolve([]) : fetchRange(recentStart, endTimestamp),
  ])

  return {
    fees: [...cachedFees, ...newFees, ...recentFees],
    cacheHits: cacheableDates.length - datesToFetch.length,
    cacheMisses: datesToFetch.length,
  }
}
