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
import { enrichFeesWithUsdPrices } from '../enrichment'

import {
  BLOCKSCOUT_API_URL,
  COW_PAYOUT_SAFE,
  DAO_TREASURY_ETHEREUM,
  ETHEREUM_CHAIN_ID,
  WETH_ASSET_ID,
} from './constants'
import type { BlockscoutInternalTxResponse } from './types'

/**
 * Fetches internal transactions from Blockscout API with pagination
 * Filters for transactions FROM CoW payout Safe TO ShapeShift treasury
 */
const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  return withRetry(async () => {
    const fees: Fees[] = []
    let nextPageParams: Record<string, unknown> | null = null
    let pageCount = 0
    const maxPages = 20

    do {
      pageCount++

      const url = `${BLOCKSCOUT_API_URL}/addresses/${DAO_TREASURY_ETHEREUM}/internal-transactions`

      const params: Record<string, unknown> = {
        filter: 'to',
      }

      if (nextPageParams) {
        Object.assign(params, nextPageParams)
      }

      const { data } = await axios.get<BlockscoutInternalTxResponse>(url, {
        params,
        timeout: 30000,
      })

      if (!data || !Array.isArray(data.items)) {
        console.error('[cowswap] Invalid API response structure')
        break
      }

      for (const tx of data.items) {
        if (!tx.success) continue

        if (tx.from.hash.toLowerCase() !== COW_PAYOUT_SAFE.toLowerCase()) {
          continue
        }

        const timestamp = Math.floor(new Date(tx.timestamp).getTime() / 1000)

        if (timestamp < startTimestamp) {
          console.log(
            `[cowswap] Reached start boundary (${new Date(timestamp * 1000).toISOString()} < ${new Date(startTimestamp * 1000).toISOString()})`
          )
          return fees
        }

        if (timestamp > endTimestamp) {
          continue
        }

        fees.push({
          chainId: ETHEREUM_CHAIN_ID,
          assetId: WETH_ASSET_ID,
          service: 'cowswap',
          txHash: tx.transaction_hash,
          timestamp,
          amount: tx.value,
        })
      }

      nextPageParams = data.next_page_params

      if (pageCount >= maxPages) {
        console.warn(`[cowswap] Reached max pages (${maxPages}), stopping pagination`)
        break
      }
    } while (nextPageParams !== null)

    console.log(`[cowswap] Fetched ${fees.length} fees across ${pageCount} pages`)
    return fees
  })
}

/**
 * Main getFees function - follows standard 5-step pattern
 */
export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const cachedFees: Fees[] = []
  const datesToFetch: string[] = []
  let cacheHits = 0
  let cacheMisses = 0

  for (const date of cacheableDates) {
    const cached = tryGetCachedFees('cowswap', ETHEREUM_CHAIN_ID, date)
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
      saveCachedFees('cowswap', ETHEREUM_CHAIN_ID, date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  const totalFees = cachedFees.length + newFees.length + recentFees.length
  const duration = Date.now() - startTime

  console.log(`[cowswap] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`)

  const allFees = [...cachedFees, ...newFees, ...recentFees]
  return enrichFeesWithUsdPrices(allFees)
}
