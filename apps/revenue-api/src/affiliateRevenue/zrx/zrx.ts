import axios from 'axios'

import type { Fees } from '..'
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
import { enrichFeesWithUsdPrices } from '../postProcessing'
import { getSlip44ForChain, safeAmountToString } from '../utils'

import { NATIVE_TOKEN_ADDRESS, SERVICES, ZRX_API_KEY, ZRX_API_URL } from './constants'
import type { TradesResponse } from './types'

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []

  for (const service of SERVICES) {
    let cursor: string | undefined

    do {
      const { data } = await withRetry(() =>
        axios.get<TradesResponse>(`${ZRX_API_URL}/${service}`, {
          params: { cursor, startTimestamp, endTimestamp },
          headers: {
            '0x-api-key': ZRX_API_KEY,
            '0x-version': 'v2',
          },
        })
      )

      for (const trade of data.trades) {
        const token = trade.fees.integratorFee?.token
        const rawAmount = safeAmountToString(trade.fees.integratorFee?.amount)

        if (!rawAmount || !token) continue

        const chainId = `eip155:${trade.chainId}`
        const assetId =
          token.toLowerCase() === NATIVE_TOKEN_ADDRESS
            ? `${chainId}/slip44:${getSlip44ForChain(chainId)}`
            : `${chainId}/erc20:${token}`

        fees.push({
          chainId,
          assetId,
          service: 'zrx',
          txHash: trade.transactionHash,
          timestamp: trade.timestamp,
          amount: rawAmount,
          originalUsdValue: trade.fees.integratorFee?.amountUsd,
        })
      }

      cursor = data.nextCursor
    } while (cursor)
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
    const cached = tryGetCachedFees('zrx', 'all', date)
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
      saveCachedFees('zrx', 'all', date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  const totalFees = cachedFees.length + newFees.length + recentFees.length
  const duration = Date.now() - startTime

  console.log(`[zrx] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`)

  const allFees = [...cachedFees, ...newFees, ...recentFees]
  return enrichFeesWithUsdPrices(allFees)
}
