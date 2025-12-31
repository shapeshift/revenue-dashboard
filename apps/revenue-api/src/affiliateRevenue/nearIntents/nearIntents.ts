import axios from 'axios'

import type { Fees } from '..'
import { withRetry } from '../../utils/retry'
import { assetDataService } from '../assetDataService'
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

import { DAO_TREASURY_NEAR, FEE_BPS_DENOMINATOR, NEAR_INTENTS_API_KEY } from './constants'
import type { TransactionsResponse } from './types'
import { parseNearIntentsAsset, sleep } from './utils'

const fetchPage = async (page: number, startTimestamp: number, endTimestamp: number): Promise<TransactionsResponse> => {
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

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []
  let page: number | undefined = 1

  while (page) {
    const data = await fetchPage(page, startTimestamp, endTimestamp)

    if (!data || !Array.isArray(data.data)) {
      console.error(`[nearIntents] Invalid API response structure on page ${page}`, data)
      break
    }

    for (const transaction of data.data) {
      const { chainId, assetId } = parseNearIntentsAsset(transaction.originAsset)
      const txHash = transaction.originChainTxHashes[0] || transaction.nearTxHashes[0] || transaction.intentHashes || ''

      for (const appFee of transaction.appFees) {
        if (appFee.recipient !== DAO_TREASURY_NEAR) {
          continue
        }

        const amountIn = parseFloat(transaction.amountIn)
        const amountInUsd = parseFloat(transaction.amountInUsd)

        if (isNaN(amountIn) || isNaN(amountInUsd)) {
          console.warn(
            `[nearIntents] Invalid amounts in tx ${transaction.intentHashes}: amountIn=${transaction.amountIn}, amountInUsd=${transaction.amountInUsd}`
          )
          continue
        }

        const feeAmountDecimal = (amountIn * appFee.fee) / FEE_BPS_DENOMINATOR
        const feeUsd = (amountInUsd * appFee.fee) / FEE_BPS_DENOMINATOR

        // Convert decimal amount to wei
        const decimals = assetDataService.getAssetDecimals(assetId)
        const feeAmountWei = String(Math.floor(feeAmountDecimal * 10 ** decimals))

        fees.push({
          chainId,
          assetId,
          service: 'nearintents',
          txHash,
          timestamp: transaction.createdAtTimestamp,
          amount: feeAmountWei,
          originalUsdValue: String(feeUsd),
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
  await assetDataService.ensureLoadedAsync()

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

  console.log(
    `[nearintents] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  const allFees = [...cachedFees, ...newFees, ...recentFees]
  return enrichFeesWithUsdPrices(allFees)
}
