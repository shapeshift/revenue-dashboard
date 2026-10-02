import axios from 'axios'

import { formatError } from '../../utils/error'
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
import { DAO_TREASURY_BASE } from '../constants'
import type { Fees } from '../types'

import { RELAY_API_KEY, RELAY_API_URL, SHAPESHIFT_REFERRER } from './constants'
import type { RelayResponse } from './types'
import { buildAssetId, getChainConfig } from './utils'

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  return withRetry('relay', async () => {
    const fees: Fees[] = []
    let continuation: string | undefined
    const chainConfigCache = new Map<number, ReturnType<typeof getChainConfig>>()

    do {
      const { data } = await axios.get<RelayResponse>(`${RELAY_API_URL}/requests/v3`, {
        headers: { 'x-api-key': RELAY_API_KEY },
        params: {
          referrer: SHAPESHIFT_REFERRER,
          // v3 only allows filtering by referrer when scoped to an api key we own
          apiKey: RELAY_API_KEY,
          startTimestamp,
          endTimestamp,
          status: 'success',
          continuation,
          limit: 50,
        },
        timeout: 30000,
      })

      // throw rather than return partial pages, which would be cached as the complete range
      if (!data || !Array.isArray(data.requests)) throw new Error('[relay] Invalid API response structure')

      continuation = data.continuation

      if (data.requests.length === 0) continue

      for (const request of data.requests) {
        // `actual` is what settled; `quoted` can include fees that were never charged
        const appFees = request.data?.appFees?.actual ?? []
        const relevantFees = appFees.filter(fee => fee.recipient.toLowerCase() === DAO_TREASURY_BASE.toLowerCase())

        if (relevantFees.length === 0) continue

        const currencyObject = request.data?.appFees?.currency
        if (!currencyObject) {
          console.warn(`[relay] Skipped fee - missing appFees.currency`, { requestId: request.id })
          continue
        }

        let chainConfig = chainConfigCache.get(currencyObject.chainId)
        if (!chainConfig) {
          chainConfig = getChainConfig(currencyObject.chainId)
          chainConfigCache.set(currencyObject.chainId, chainConfig)
        }

        const { chainId, slip44, isEvm } = chainConfig
        const assetId = buildAssetId(chainId, slip44, currencyObject.address, isEvm)
        const txHash = request.data?.inTxs?.[0]?.txHash ?? ''
        const timestamp = Math.floor(new Date(request.createdAt).getTime() / 1000)

        for (const appFee of relevantFees) {
          fees.push({
            chainId,
            assetId,
            service: 'relay',
            txHash,
            timestamp,
            amount: appFee.amount,
            // USD at swap time; enrichment re-prices at current prices when decimals are known
            amountUsd: appFee.amountUsd,
          })
        }
      }
    } while (continuation)

    return fees
  })
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()
  const cacheFees = (chunk: string[], fees: Fees[]) => {
    const feesByDate = groupFeesByDate(fees)
    for (const date of chunk) {
      saveCachedFees('relay', 'all', date, feesByDate[date] || [])
    }
  }

  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const cachedFees: Fees[] = []
  const datesToFetch: string[] = []
  let cacheHits = 0
  let cacheMisses = 0

  for (const date of cacheableDates) {
    const cached = tryGetCachedFees('relay', 'all', date)
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
    const PARALLEL_BATCHES = 3
    const chunkSize = Math.ceil(datesToFetch.length / PARALLEL_BATCHES)
    const chunks: string[][] = []
    for (let i = 0; i < datesToFetch.length; i += chunkSize) {
      chunks.push(datesToFetch.slice(i, i + chunkSize))
    }

    const promises = chunks.map(chunk =>
      fetchFeesFromAPI(getDateStartTimestamp(chunk[0]), getDateEndTimestamp(chunk[chunk.length - 1])).then(fees => ({
        chunk,
        fees,
      }))
    )

    const results = await Promise.allSettled(promises)
    const failedChunks: string[][] = []

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const chunk = chunks[i]

      if (result.status === 'fulfilled') {
        const { fees } = result.value
        cacheFees(chunk, fees)
        newFees.push(...fees)
      } else {
        console.error(`[relay] Chunk fetch failed (${chunk.length} dates): ${formatError(result.reason)}`)

        console.warn(`[relay] Retrying chunk as single request fallback`)
        try {
          const fees = await fetchFeesFromAPI(
            getDateStartTimestamp(chunk[0]),
            getDateEndTimestamp(chunk[chunk.length - 1])
          )
          cacheFees(chunk, fees)
          newFees.push(...fees)
        } catch (fallbackError) {
          console.error(`[relay] Fallback also failed: ${formatError(fallbackError)}`)
          failedChunks.push(chunk)
        }
      }
    }

    if (failedChunks.length > 0) {
      const failedDates = failedChunks.flat()
      throw new Error(
        `[relay] Failed to fetch fees for ${failedDates.length} dates after retry: ${failedDates.join(', ')}`
      )
    }
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  const totalFees = cachedFees.length + newFees.length + recentFees.length
  const duration = Date.now() - startTime

  console.log(`[relay] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`)

  return [...cachedFees, ...newFees, ...recentFees]
}
