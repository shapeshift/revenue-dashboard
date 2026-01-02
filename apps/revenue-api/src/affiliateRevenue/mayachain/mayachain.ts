import axios from 'axios'

import type { Fees } from '..'
import { assetDataService } from '../../utils/assetDataService'
import {
  getCacheableThreshold,
  getDateEndTimestamp,
  getDateStartTimestamp,
  groupFeesByDate,
  saveCachedFees,
  splitDateRange,
  tryGetCachedFees,
} from '../cache'
import { MAYACHAIN_CHAIN_ID, SLIP44 } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'

import { MAYACHAIN_API_URL, MILLISECONDS_PER_SECOND } from './constants'
import type { FeesResponse } from './types'

const transformFee = (fee: FeesResponse['fees'][0]): Fees => {
  const chainId = MAYACHAIN_CHAIN_ID
  const assetId = `${chainId}/slip44:${SLIP44.MAYACHAIN}`

  return {
    chainId,
    assetId,
    service: 'mayachain',
    txHash: fee.txId,
    timestamp: Math.round(fee.timestamp / 1000),
    amount: fee.amount,
  }
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const start = startTimestamp * MILLISECONDS_PER_SECOND
  const end = endTimestamp * MILLISECONDS_PER_SECOND

  const { data } = await axios.get<FeesResponse>(MAYACHAIN_API_URL, {
    params: { start, end },
  })

  return data.fees.map(transformFee)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  await assetDataService.ensureLoadedAsync()

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
    const fetched = await fetchFeesFromAPI(fetchStart, fetchEnd)

    const feesByDate = groupFeesByDate(fetched)
    for (const date of datesToFetch) {
      saveCachedFees('mayachain', MAYACHAIN_CHAIN_ID, date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  const totalFees = cachedFees.length + newFees.length + recentFees.length
  const duration = Date.now() - startTime

  console.log(`[mayachain] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`)

  return enrichFeesWithUsdPrices([...cachedFees, ...newFees, ...recentFees])
}
