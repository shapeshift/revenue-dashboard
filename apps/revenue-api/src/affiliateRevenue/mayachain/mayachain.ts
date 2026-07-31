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
import { MAYACHAIN_CHAIN_ID } from '../constants'
import type { Fees } from '../types'
import { buildAssetId } from '../utils'

import { MIDGARD_AFFILIATE, MIDGARD_BASE_URL, MIDGARD_PAGE_LIMIT, USDC_POOL } from './constants'
import type { DepthHistory, MidgardAction, MidgardActionsResponse } from './types'

const selectInterval = (startTimestamp: number, endTimestamp: number): string => {
  const seconds = endTimestamp - startTimestamp
  if (seconds <= 1_209_600) return 'hour' // up to 2 weeks
  if (seconds <= 34_560_000) return 'day' // up to 400 days
  if (seconds <= 94_608_000) return 'week' // up to 3 years
  return 'month'
}

// derive historical CACAO spot price from the USDC pool depth history: assetPriceUSD / assetPrice
// (assetPrice is the asset's price in CACAO, so dividing yields USD per CACAO)
const fetchCacaoPriceLookup = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<(timestamp: number) => number | undefined> => {
  const interval = selectInterval(startTimestamp, endTimestamp)

  const { data } = await withRetry('mayachain/midgard-cacaoPrice', () =>
    axios.get<DepthHistory>(`${MIDGARD_BASE_URL}/history/depths/${USDC_POOL}`, {
      params: { from: startTimestamp, to: endTimestamp, interval },
    })
  )

  const intervals = (data.intervals ?? [])
    .map(({ startTime, endTime, assetPrice, assetPriceUSD }) => ({
      startTime: Number(startTime),
      endTime: Number(endTime),
      priceUSD: Number(assetPrice) > 0 ? Number(assetPriceUSD) / Number(assetPrice) : 0,
    }))
    .filter(i => i.priceUSD > 0)

  return (timestamp: number): number | undefined =>
    (intervals.filter(i => i.startTime <= timestamp).at(-1) ?? intervals[0])?.priceUSD
}

const actionTimestamp = (action: MidgardAction): number => Math.floor(Number(action.date) / 1_000_000_000)

// mayachain midgard's fromTimestamp param expects nanoseconds (unlike thorchain's seconds) and
// pages unstably when combined with timestamp, so page descending under timestamp (seconds) only
// and bound the lower edge of the window client-side. timestamp cuts at exactly endTimestamp*1e9
// nanoseconds, which would drop final-second fees — pass endTimestamp+1 and let the client-side
// filter trim to the window
const fetchMidgardActions = async (startTimestamp: number, endTimestamp: number): Promise<MidgardAction[]> => {
  const actions: MidgardAction[] = []

  let offset = 0
  while (true) {
    const { data } = await withRetry('mayachain/midgard-actions', () =>
      axios.get<MidgardActionsResponse>(`${MIDGARD_BASE_URL}/actions`, {
        params: {
          affiliate: MIDGARD_AFFILIATE,
          timestamp: endTimestamp + 1,
          limit: MIDGARD_PAGE_LIMIT,
          offset,
        },
      })
    )

    const batch = data.actions ?? []
    actions.push(...batch)

    if (batch.length < MIDGARD_PAGE_LIMIT) break

    const oldest = batch[batch.length - 1]
    if (actionTimestamp(oldest) < startTimestamp) break

    offset += MIDGARD_PAGE_LIMIT
  }

  return actions.filter(a => {
    const ts = actionTimestamp(a)
    return ts >= startTimestamp && ts <= endTimestamp
  })
}

const fetchFeesFromMidgard = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const [getCacaoPrice, allActions] = await Promise.all([
    fetchCacaoPriceLookup(startTimestamp, endTimestamp),
    fetchMidgardActions(startTimestamp, endTimestamp),
  ])

  const chainId = MAYACHAIN_CHAIN_ID
  const assetId = buildAssetId(chainId)

  return allActions.reduce<Fees[]>((acc, action) => {
    const affiliateOut = action.out.find(o => o.affiliate === true)
    if (!affiliateOut?.coins?.[0]) return acc

    const inTxId = action.in[0]?.txID
    if (!inTxId) return acc

    const cacaoAmount = affiliateOut.coins[0].amount
    const timestamp = actionTimestamp(action)

    const cacaoPrice = getCacaoPrice(timestamp)
    const amountUsd = cacaoPrice !== undefined ? ((Number(cacaoAmount) / 1e10) * cacaoPrice).toString() : undefined

    acc.push({
      chainId,
      assetId,
      service: 'mayachain',
      txHash: inTxId,
      timestamp,
      amount: cacaoAmount,
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
    const cached = tryGetCachedFees('mayachain', MAYACHAIN_CHAIN_ID, date)
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
      saveCachedFees('mayachain', MAYACHAIN_CHAIN_ID, date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromMidgard(recentStart, endTimestamp)))
  }

  const totalFees = cachedFees.length + newFees.length + recentFees.length
  const duration = Date.now() - startTime

  console.log(`[mayachain] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`)

  return [...cachedFees, ...newFees, ...recentFees]
}
