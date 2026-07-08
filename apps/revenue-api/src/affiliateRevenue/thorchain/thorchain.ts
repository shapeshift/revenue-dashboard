import axios from 'axios'

import { withRetry } from '../../utils/retry'
import {
  getCacheableThreshold,
  getDateEndTimestamp,
  getDateStartTimestamp,
  groupFeesByDate,
  saveCachedFees,
  splitDateRange,
  tryGetCachedFees,
} from '../cache'
import { THORCHAIN_CHAIN_ID } from '../constants'
import type { Fees } from '../types'

import { MIDGARD_AFFILIATE, MIDGARD_BASE_URL, MIDGARD_PAGE_LIMIT, RUNE_ASSET_ID } from './constants'
import type { MidgardAction, MidgardActionsResponse, RunePriceHistory } from './types'

const selectInterval = (startTimestamp: number, endTimestamp: number): string => {
  const seconds = endTimestamp - startTimestamp
  if (seconds <= 1_209_600) return 'hour' // up to 2 weeks
  if (seconds <= 34_560_000) return 'day' // up to 400 days
  if (seconds <= 94_608_000) return 'week' // up to 3 years
  return 'month'
}

const fetchRunePriceLookup = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<(timestamp: number) => number | undefined> => {
  const interval = selectInterval(startTimestamp, endTimestamp)

  const { data } = await withRetry('thorchain/midgard-runePrice', () =>
    axios.get<RunePriceHistory>(`${MIDGARD_BASE_URL}/history/rune`, {
      params: { from: startTimestamp, to: endTimestamp, interval },
    })
  )

  const intervals = (data.intervals ?? [])
    .map(({ startTime, endTime, runePriceUSD }) => ({
      startTime: Number(startTime),
      endTime: Number(endTime),
      priceUSD: Number(runePriceUSD),
    }))
    .filter(i => i.priceUSD > 0)

  return (timestamp: number): number | undefined =>
    (intervals.filter(i => i.startTime <= timestamp).at(-1) ?? intervals[0])?.priceUSD
}

const fetchMidgardActions = async (startTimestamp: number, endTimestamp: number): Promise<MidgardAction[]> => {
  const actions: MidgardAction[] = []

  let offset = 0
  while (true) {
    const { data } = await withRetry('thorchain/midgard-actions', () =>
      axios.get<MidgardActionsResponse>(`${MIDGARD_BASE_URL}/actions`, {
        params: {
          affiliate: MIDGARD_AFFILIATE,
          fromTimestamp: startTimestamp,
          timestamp: endTimestamp,
          limit: MIDGARD_PAGE_LIMIT,
          offset,
        },
      })
    )

    const batch = data.actions ?? []
    actions.push(...batch)

    if (batch.length < MIDGARD_PAGE_LIMIT) break

    offset += MIDGARD_PAGE_LIMIT
  }
  return actions
}

const fetchFeesFromMidgard = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const [getRunePrice, allActions] = await Promise.all([
    fetchRunePriceLookup(startTimestamp, endTimestamp),
    fetchMidgardActions(startTimestamp, endTimestamp),
  ])

  return allActions.reduce<Fees[]>((acc, action) => {
    const affiliateOut = action.out.find(o => o.affiliate === true)
    if (!affiliateOut?.coins?.[0]) return acc

    const inTxId = action.in[0]?.txID
    if (!inTxId) return acc

    const runeAmount = affiliateOut.coins[0].amount
    const timestamp = Math.floor(Number(action.date) / 1_000_000_000)

    const runePrice = getRunePrice(timestamp)
    const amountUsd = runePrice !== undefined ? ((Number(runeAmount) / 1e8) * runePrice).toString() : undefined

    acc.push({
      chainId: THORCHAIN_CHAIN_ID,
      assetId: RUNE_ASSET_ID,
      service: 'thorchain',
      txHash: inTxId,
      timestamp,
      amount: runeAmount,
      amountUsd,
      originalUsdValue: amountUsd,
    })

    return acc
  }, [])
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()
  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const cachedFees: Fees[] = []
  const datesToFetch: string[] = []
  let cacheHits = 0
  let cacheMisses = 0

  for (const date of cacheableDates) {
    const cached = tryGetCachedFees('thorchain', THORCHAIN_CHAIN_ID, date)
    if (cached) {
      cachedFees.push(...cached)
      cacheHits++
    } else {
      datesToFetch.push(date)
      cacheMisses++
    }
  }

  const newFees: Fees[] = []
  if (datesToFetch.length > 0) {
    const fetchStart = getDateStartTimestamp(datesToFetch[0])
    const fetchEnd = getDateEndTimestamp(datesToFetch[datesToFetch.length - 1])
    const fetched = await fetchFeesFromMidgard(fetchStart, fetchEnd)

    const feesByDate = groupFeesByDate(fetched)
    for (const date of datesToFetch) {
      saveCachedFees('thorchain', THORCHAIN_CHAIN_ID, date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromMidgard(recentStart, endTimestamp)))
  }

  const totalFees = cachedFees.length + newFees.length + recentFees.length
  const duration = Date.now() - startTime
  console.log(`[thorchain] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`)

  return [...cachedFees, ...newFees, ...recentFees]
}
