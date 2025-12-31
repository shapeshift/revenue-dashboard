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
import { DAO_TREASURY_BASE } from '../constants'
import { enrichFeesWithUsdPrices } from '../postProcessing'
import { getAssetPriceUsd } from '../priceCache'

import { RELAY_API_URL, SHAPESHIFT_REFERRER } from './constants'
import type { RelayResponse } from './types'
import { buildAssetId, getChainConfig } from './utils'

const validateAmount = async (
  amount: string,
  amountUsd: string,
  decimals: number,
  assetId: string
): Promise<{ isValid: boolean; reason?: string }> => {
  const amountNum = Number(amount)
  const apiUsd = Number(amountUsd)

  // Get current price for validation
  const currentPrice = await getAssetPriceUsd(assetId)

  if (!currentPrice) {
    return { isValid: false, reason: 'no_price' }
  }

  // Calculate expected USD if amount is in wei
  const amountDecimal = amountNum / 10 ** decimals
  const derivedUsd = amountDecimal * currentPrice

  // Validate: allow 10x range for price volatility
  const ratio = derivedUsd / apiUsd

  if (ratio > 0.1 && ratio < 10) {
    return { isValid: true }
  }

  // Check if it's the micro-USD bug
  const microUsdRatio = Math.abs(amountNum / 1e6 - apiUsd) / apiUsd
  if (microUsdRatio < 0.01) {
    return { isValid: false, reason: 'micro_usd_format' }
  }

  return { isValid: false, reason: `suspicious_ratio_${ratio.toFixed(2)}x` }
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  return withRetry(async () => {
    const fees: Fees[] = []
    let continuation: string | undefined
    const chainConfigCache = new Map<number, ReturnType<typeof getChainConfig>>()

    // Validation metrics
    let validAmounts = 0
    let fallbackAmounts = 0
    const fallbackExamples: any[] = []

    do {
      const { data } = await axios.get<RelayResponse>(`${RELAY_API_URL}/requests/v2`, {
        params: {
          referrer: SHAPESHIFT_REFERRER,
          startTimestamp,
          endTimestamp,
          status: 'success',
          continuation,
          limit: 50,
        },
        timeout: 30000,
      })

      if (!data || !Array.isArray(data.requests)) {
        console.error('[relay] Invalid API response structure')
        break
      }

      continuation = data.continuation

      if (data.requests.length === 0) continue

      for (const request of data.requests) {
        const appFees = request.data?.appFees ?? []
        const relevantFees = appFees.filter(fee => fee.recipient.toLowerCase() === DAO_TREASURY_BASE.toLowerCase())

        if (relevantFees.length === 0) continue

        const currencyObject = request.data?.feeCurrencyObject ?? request.data?.metadata?.currencyIn?.currency
        if (!currencyObject) {
          console.warn(`[relay] Skipped fee - missing currency object`, { requestId: request.id })
          continue
        }

        let chainConfig = chainConfigCache.get(currencyObject.chainId)
        if (!chainConfig) {
          chainConfig = getChainConfig(currencyObject.chainId)
          chainConfigCache.set(currencyObject.chainId, chainConfig)
        }

        const { chainId, slip44, isEvm } = chainConfig
        const assetId = buildAssetId(chainId, slip44, currencyObject.address, isEvm)
        const txHash = request.data?.inTxs?.[0]?.hash ?? ''
        const timestamp = Math.floor(new Date(request.createdAt).getTime() / 1000)

        for (const appFee of relevantFees) {
          // Validate amount format
          const validation = await validateAmount(appFee.amount, appFee.amountUsd, currencyObject.decimals, assetId)

          if (validation.isValid) {
            // Amount is valid wei - don't set amountUsd, calculate later
            validAmounts++
            fees.push({
              chainId,
              assetId,
              service: 'relay',
              txHash,
              timestamp,
              amount: appFee.amount,
              originalUsdValue: appFee.amountUsd,
            })
          } else {
            // Amount is suspicious - preserve API USD
            fallbackAmounts++

            if (fallbackExamples.length < 5) {
              fallbackExamples.push({
                reason: validation.reason,
                amount: appFee.amount,
                amountUsd: appFee.amountUsd,
                decimals: currencyObject.decimals,
                symbol: currencyObject.symbol,
                assetId,
              })
            }

            fees.push({
              chainId,
              assetId,
              service: 'relay',
              txHash,
              timestamp,
              amount: appFee.amount,
              amountUsd: appFee.amountUsd, // Preserve historical USD
              originalUsdValue: appFee.amountUsd,
            })
          }
        }
      }
    } while (continuation)

    if (fallbackExamples.length > 0) {
      console.log(`[relay] Fallback examples (first ${fallbackExamples.length}):`)
      fallbackExamples.forEach((ex, i) => {
        console.log(
          `  ${i + 1}. ${ex.symbol}: amount=${ex.amount}, usd=${ex.amountUsd}, decimals=${ex.decimals}, reason=${ex.reason}`
        )
      })
    }

    console.log(`[relay] Amount validation: ${validAmounts} valid, ${fallbackAmounts} fallback`)

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
        console.error(`[relay] Chunk fetch failed (${chunk.length} dates):`, result.reason)

        console.warn(`[relay] Retrying chunk as single request fallback`)
        try {
          const fees = await fetchFeesFromAPI(
            getDateStartTimestamp(chunk[0]),
            getDateEndTimestamp(chunk[chunk.length - 1])
          )
          cacheFees(chunk, fees)
          newFees.push(...fees)
        } catch (fallbackError) {
          console.error(`[relay] Fallback also failed:`, fallbackError)
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

  const allFees = [...cachedFees, ...newFees, ...recentFees]
  return enrichFeesWithUsdPrices(allFees)
}
