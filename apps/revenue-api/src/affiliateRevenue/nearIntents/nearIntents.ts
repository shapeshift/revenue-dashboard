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
import { FEE_BPS_DENOMINATOR } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { calculateFee } from '../utils'

import {
  DAO_NEAR_TREASURY_ADDRESSES,
  NEAR_INTENTS_API_KEY,
  PAGE_SIZE,
  REQUEST_INTERVAL_MS,
  TRANSACTIONS_API,
} from './constants'
import * as tokenRegistry from './tokenRegistry'
import type { NearIntentsTransaction, TransactionsResponse } from './types'
import { parseNearIntentsAsset, sleep } from './utils'

let nextRequestAt = 0
const throttle = async (): Promise<void> => {
  const wait = nextRequestAt - Date.now()
  if (wait > 0) await sleep(wait)
  nextRequestAt = Date.now() + REQUEST_INTERVAL_MS
}

const fetchPage = async (page: number, startTimestamp: number, endTimestamp: number): Promise<TransactionsResponse> => {
  return withRetry(
    'nearIntents',
    async () => {
      await throttle()
      const { data } = await axios.get<TransactionsResponse>(TRANSACTIONS_API, {
        params: {
          referral: 'shapeshift',
          page,
          perPage: PAGE_SIZE,
          statuses: 'SUCCESS',
          startTimestampUnix: startTimestamp,
          endTimestampUnix: endTimestamp,
        },
        headers: { Authorization: `Bearer ${NEAR_INTENTS_API_KEY}` },
      })
      return data
    },
    { initialDelay: REQUEST_INTERVAL_MS }
  )
}

const fetchTransactions = async (startTimestamp: number, endTimestamp: number): Promise<NearIntentsTransaction[]> => {
  const transactions: NearIntentsTransaction[] = []
  let page: number | undefined = 1

  while (page) {
    const data = await fetchPage(page, startTimestamp, endTimestamp)

    if (!data || !Array.isArray(data.data)) {
      console.error(`[nearIntents] Invalid API response structure on page ${page}`, data)
      break
    }

    transactions.push(...data.data)
    page = data.nextPage
  }

  return transactions
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []

  const transactions = await fetchTransactions(startTimestamp, endTimestamp)

  for (const transaction of transactions) {
    const { chainId, assetId } = parseNearIntentsAsset(transaction.originAsset)
    const txHash = transaction.originChainTxHashes[0] || transaction.nearTxHashes[0] || transaction.intentHashes || ''

    for (const appFee of transaction.appFees) {
      if (!DAO_NEAR_TREASURY_ADDRESSES.includes(appFee.recipient)) {
        continue
      }

      // amountIn is already in smallest units (wei/satoshi), use directly
      const amountInStr = transaction.amountIn
      const amountInUsd = parseFloat(transaction.amountInUsd)

      if (isNaN(amountInUsd)) {
        console.warn(`[nearIntents] Invalid amountInUsd in tx ${transaction.intentHashes}: ${transaction.amountInUsd}`)
        continue
      }

      // Calculate fee using BigNumber arithmetic
      const feeAmount = calculateFee(amountInStr, appFee.fee, FEE_BPS_DENOMINATOR)
      const feeUsd = (amountInUsd * appFee.fee) / FEE_BPS_DENOMINATOR

      fees.push({
        chainId,
        assetId,
        service: 'nearintents',
        txHash,
        timestamp: transaction.createdAtTimestamp,
        amount: feeAmount,
        amountUsd: String(feeUsd),
      })
    }
  }

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  // parseNearIntentsAsset resolves assets via the token registry — load it up front
  await tokenRegistry.ensureLoadedAsync()
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

  const allFees = [...cachedFees, ...newFees, ...recentFees]
  const totalFees = allFees.length
  const duration = Date.now() - startTime

  console.log(
    `[nearintents] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  // Enrich NEAR Intents fees with current USD prices
  const enrichedFees = await enrichFeesWithUsdPrices(allFees)

  return enrichedFees
}
