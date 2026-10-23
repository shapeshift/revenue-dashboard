import axios from 'axios'

import { withRetry } from '../../utils/retry'
import { createThrottle } from '../../utils/throttle'
import { FEE_BPS_DENOMINATOR } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { calculateFee, getCachedFees } from '../utils'

import {
  DAO_NEAR_TREASURY_ADDRESSES,
  NEAR_INTENTS_API_KEY,
  PAGE_SIZE,
  REQUEST_INTERVAL_MS,
  TRANSACTIONS_API,
} from './constants'
import * as tokenRegistry from './tokenRegistry'
import type { NearIntentsTransaction, TransactionsResponse } from './types'
import { parseNearIntentsAsset } from './utils'

const throttle = createThrottle(REQUEST_INTERVAL_MS)

const fetchPage = async (
  cursor: string | undefined,
  startTimestamp: number,
  endTimestamp: number
): Promise<TransactionsResponse> => {
  return withRetry(
    'nearIntents',
    async () => {
      await throttle()
      const { data } = await axios.get<TransactionsResponse>(TRANSACTIONS_API, {
        params: {
          referral: 'shapeshift',
          numberOfTransactions: PAGE_SIZE,
          ...(cursor && { lastDepositAddressAndMemo: cursor, direction: 'next' }),
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
  let cursor: string | undefined

  for (;;) {
    const data = await fetchPage(cursor, startTimestamp, endTimestamp)

    if (!Array.isArray(data)) {
      throw new Error(`[nearIntents] Invalid API response structure: ${JSON.stringify(data).slice(0, 200)}`)
    }

    transactions.push(...data)
    if (data.length < PAGE_SIZE) break

    // without a fresh cursor the next request would refetch the same page forever
    const nextCursor = data[data.length - 1].depositAddressAndMemo
    if (!nextCursor || nextCursor === cursor) {
      throw new Error(`[nearIntents] Invalid or unchanged pagination cursor: ${JSON.stringify(nextCursor)}`)
    }
    cursor = nextCursor
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
  const { fees, cacheHits, cacheMisses } = await getCachedFees(
    'nearintents',
    'all',
    startTimestamp,
    endTimestamp,
    fetchFeesFromAPI
  )

  console.log(
    `[nearintents] Total: ${fees.length} fees in ${Date.now() - startTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return enrichFeesWithUsdPrices(fees)
}
