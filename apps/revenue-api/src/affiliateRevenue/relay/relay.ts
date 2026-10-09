import axios from 'axios'

import { formatError } from '../../utils/error'
import { withRetry } from '../../utils/retry'
import { getDateEndTimestamp, getDateRange, getDateStartTimestamp } from '../cache'
import { DAO_TREASURY_BASE } from '../constants'
import type { Fees } from '../types'
import { getCachedFees } from '../utils'

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
        if (!request.data?.appFees) continue

        // Throw on incomplete fee records so the chunk fails instead of being cached without this revenue.
        // `actual` is what settled; `quoted` can include fees that were never charged
        const { actual, currency: currencyObject } = request.data.appFees
        if (!Array.isArray(actual)) throw new Error(`[relay] Missing appFees.actual on request ${request.id}`)

        const relevantFees = actual.filter(fee => fee.recipient.toLowerCase() === DAO_TREASURY_BASE.toLowerCase())

        if (relevantFees.length === 0) continue

        if (!currencyObject) throw new Error(`[relay] Missing appFees.currency on fee-bearing request ${request.id}`)

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

const PARALLEL_BATCHES = 3

// Split a window into a few parallel requests, retrying a failed chunk once as a single request
const fetchFeesInChunks = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const dates = getDateRange(startTimestamp, endTimestamp)
  const chunkSize = Math.ceil(dates.length / PARALLEL_BATCHES)
  const chunks: string[][] = []
  for (let i = 0; i < dates.length; i += chunkSize) {
    chunks.push(dates.slice(i, i + chunkSize))
  }

  const fetchChunk = (chunk: string[]) =>
    fetchFeesFromAPI(
      Math.max(startTimestamp, getDateStartTimestamp(chunk[0])),
      Math.min(endTimestamp, getDateEndTimestamp(chunk[chunk.length - 1]))
    )

  const results = await Promise.allSettled(chunks.map(fetchChunk))
  const fees: Fees[] = []
  const failedDates: string[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const chunk = chunks[i]

    if (result.status === 'fulfilled') {
      fees.push(...result.value)
      continue
    }

    console.error(`[relay] Chunk fetch failed (${chunk.length} dates): ${formatError(result.reason)}`)
    console.warn(`[relay] Retrying chunk as single request fallback`)
    try {
      fees.push(...(await fetchChunk(chunk)))
    } catch (fallbackError) {
      console.error(`[relay] Fallback also failed: ${formatError(fallbackError)}`)
      failedDates.push(...chunk)
    }
  }

  if (failedDates.length > 0) {
    throw new Error(
      `[relay] Failed to fetch fees for ${failedDates.length} dates after retry: ${failedDates.join(', ')}`
    )
  }

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const { fees, cacheHits, cacheMisses } = await getCachedFees(
    'relay',
    'all',
    startTimestamp,
    endTimestamp,
    fetchFeesInChunks
  )

  console.log(
    `[relay] Total: ${fees.length} fees in ${Date.now() - startTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return fees
}
