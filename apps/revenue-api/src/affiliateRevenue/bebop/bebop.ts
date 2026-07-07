import axios from 'axios'

import { assetDataService } from '../../assetData/AssetDataService'
import {
  getCacheableThreshold,
  getDateEndTimestamp,
  getDateStartTimestamp,
  groupFeesByDate,
  saveCachedFees,
  splitDateRange,
  tryGetCachedFees,
} from '../cache'
import { FEE_BPS_DENOMINATOR } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { buildAssetId, decimalToBaseUnit } from '../utils'

import { BEBOP_API_KEY, BEBOP_API_URL, NANOSECONDS_PER_SECOND, SHAPESHIFT_REFERRER } from './constants'
import type { TradesResponse } from './types'

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []

  const start = startTimestamp * NANOSECONDS_PER_SECOND
  const end = endTimestamp * NANOSECONDS_PER_SECOND

  const { data } = await axios.get<TradesResponse>(BEBOP_API_URL, {
    params: { source: SHAPESHIFT_REFERRER, start, end },
    headers: { 'source-auth': BEBOP_API_KEY },
  })

  for (const trade of data.results) {
    if (!trade.partnerFeeBps || !trade.partnerFeeNative) continue

    const chainId = `eip155:${trade.chain_id}`
    const assetId = buildAssetId(chainId)

    const asset = await assetDataService.getAsset(assetId)
    if (!asset) continue

    const amount = decimalToBaseUnit(String(trade.partnerFeeNative), asset.precision)

    fees.push({
      chainId,
      assetId,
      service: 'bebop',
      txHash: trade.txHash,
      timestamp: Math.floor(new Date(trade.timestamp).getTime() / 1000),
      amount,
      amountUsd:
        trade.volumeUsd !== undefined
          ? String(trade.volumeUsd * (Number(trade.partnerFeeBps) / FEE_BPS_DENOMINATOR))
          : undefined,
    })
  }

  return fees
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
    const cached = tryGetCachedFees('bebop', 'all', date)
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
    const fetched = await fetchFeesFromAPI(fetchStart, fetchEnd)

    const feesByDate = groupFeesByDate(fetched)
    for (const date of datesToFetch) {
      saveCachedFees('bebop', 'all', date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  const totalFees = cachedFees.length + newFees.length + recentFees.length
  const duration = Date.now() - startTime

  console.log(`[bebop] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`)

  const allFees = [...cachedFees, ...newFees, ...recentFees]
  return enrichFeesWithUsdPrices(allFees)
}
