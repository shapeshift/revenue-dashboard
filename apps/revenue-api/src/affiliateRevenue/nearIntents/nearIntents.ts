import axios from 'axios'

import type { Fees } from '..'
import {
  getCacheableThreshold,
  getDateEndTimestamp,
  getDateStartTimestamp,
  groupFeesByDate,
  saveCachedFees,
  splitDateRange,
  tryGetCachedFees,
} from '../cache'
import { withRetry } from '../../utils/retry'

import { FEE_BPS_DENOMINATOR, NEAR_INTENTS_API_KEY } from './constants'
import type { TransactionsResponse } from './types'
import { parseNearIntentsAsset, sleep } from './utils'

const fetchPage = async (
  page: number,
  startTimestamp: number,
  endTimestamp: number
): Promise<TransactionsResponse> => {
  return withRetry(async () => {
    const { data } = await axios.get<TransactionsResponse>(
      'https://explorer.near-intents.org/api/v0/transactions-pages',
      {
        params: {
          referral: 'shapeshift',
          page,
          perPage: 1000,
          statuses: 'SUCCESS',
          startTimestampUnix: startTimestamp,
          endTimestampUnix: endTimestamp,
        },
        headers: { Authorization: `Bearer ${NEAR_INTENTS_API_KEY}` },
      }
    )
    return data
  })
}

const fetchFeesFromAPI = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<Fees[]> => {
  const fees: Fees[] = []
  let page: number | undefined = 1

  while (page) {
    const data = await fetchPage(page, startTimestamp, endTimestamp)

    for (const transaction of data.data) {
      const { chainId, assetId } = parseNearIntentsAsset(transaction.originAsset)
      const txHash = transaction.originChainTxHashes[0] || transaction.nearTxHashes[0] || transaction.intentHashes || ''

      for (const appFee of transaction.appFees) {
        const feeAmount = (parseFloat(transaction.amountIn) * appFee.fee) / FEE_BPS_DENOMINATOR
        const feeUsd = (parseFloat(transaction.amountInUsd) * appFee.fee) / FEE_BPS_DENOMINATOR

        fees.push({
          chainId,
          assetId,
          service: 'nearintents',
          txHash,
          timestamp: transaction.createdAtTimestamp,
          amount: String(feeAmount),
          amountUsd: String(feeUsd),
        })
      }
    }

    page = data.nextPage

    if (page) {
      await sleep(5000)
    }
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
    const cached = tryGetCachedFees('nearintents', 'all', date)
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
      saveCachedFees('nearintents', 'all', date, feesByDate[date] || [])
    }

    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    const fetched = await fetchFeesFromAPI(recentStart, endTimestamp)
    recentFees.push(...fetched)
  }

  const totalFees = cachedFees.length + newFees.length + recentFees.length
  const duration = Date.now() - startTime

  console.log(`[nearintents] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`)

  return [...cachedFees, ...newFees, ...recentFees]
}
