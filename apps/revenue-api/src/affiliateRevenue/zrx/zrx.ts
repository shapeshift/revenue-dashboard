import axios from 'axios'

import type { Fees } from '..'
import { assetDataService } from '../../assetData/AssetDataService'
import { bn } from '../../lib/bignumber'
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
import { getAffiliateFeeRate } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import { getAssetPriceUsd } from '../priceCache'
import { baseUnitToTokenAmount, decimalToBaseUnit, getSlip44ForChain, safeAmountToString } from '../utils'

import { NATIVE_TOKEN_ADDRESS, SERVICES, ZRX_API_KEY, ZRX_API_URL } from './constants'
import type { TradesResponse } from './types'

type Trade = TradesResponse['trades'][number]

const toAssetId = (chainId: string, token: string): string => {
  return token.toLowerCase() === NATIVE_TOKEN_ADDRESS
    ? `${chainId}/slip44:${getSlip44ForChain(chainId)}`
    : `${chainId}/erc20:${token}`
}

// Decimal-format amounts virtually always carry a fractional part, while raw base-unit
// amounts are whole numbers. Normalize through BigNumber first so scientific notation
// classifies by its value (e.g. "1.74e-7" -> decimal, "1.4e+22" -> bare integer)
const isBareInteger = (amount: string): boolean => !bn(amount).toFixed().includes('.')

const getTradeVolumeUsd = async (trade: Trade): Promise<number | null> => {
  const volumeUsd = parseFloat(safeAmountToString(trade.volumeUsd))
  if (isFinite(volumeUsd) && volumeUsd > 0) return volumeUsd

  // 0x didn't price the trade - derive volume from the sell side (the user's input, before
  // fees and slippage) using our own price data. The sell amount can suffer the same format
  // ambiguity as the fee amount, so apply the same bare-integer check.
  const sellAmount = safeAmountToString(trade.sellAmount)
  if (!sellAmount) return null

  const sellAssetId = toAssetId(`eip155:${trade.chainId}`, trade.sellToken)
  const sellAsset = await assetDataService.getAsset(sellAssetId)
  const sellPrice = await getAssetPriceUsd(sellAssetId)

  if (!sellAsset || sellPrice === null) return null

  const sellTokenAmount = isBareInteger(sellAmount)
    ? bn(baseUnitToTokenAmount(sellAmount, sellAsset.precision))
    : bn(sellAmount)

  const sellValueUsd = sellTokenAmount.times(sellPrice).toNumber()
  return isFinite(sellValueUsd) && sellValueUsd > 0 ? sellValueUsd : null
}

// 0x returns integratorFee.amount in raw base units (instead of its usual decimal format)
// for tokens it lacks metadata for. Work out which format we got by valuing the amount both
// ways and keeping the interpretation closest to the expected fee (volume x affiliate bps).
// The two readings differ by 10^precision, so the comparison is never a close call.
// Returns the amount in base units, or null when there's no price/volume anchor to compare with.
const resolveBareIntegerAmountToBaseUnits = async (
  trade: Trade,
  amount: string,
  assetId: string,
  precision: number
): Promise<string | null> => {
  const [price, volumeUsd] = await Promise.all([getAssetPriceUsd(assetId), getTradeVolumeUsd(trade)])

  if (price === null || volumeUsd === null) {
    console.warn(`[zrx] Skipped fee - bare-integer amount with no price/volume anchor to disambiguate`, {
      txHash: trade.transactionHash,
      assetId,
      amount: amount,
    })
    return null
  }

  const expectedFeeUsd = volumeUsd * getAffiliateFeeRate(trade.timestamp)
  const usdIfDecimal = bn(amount).times(price).toNumber()
  const usdIfBaseUnits = bn(baseUnitToTokenAmount(amount, precision)).times(price).toNumber()

  const isBaseUnits =
    Math.abs(Math.log10(usdIfBaseUnits / expectedFeeUsd)) < Math.abs(Math.log10(usdIfDecimal / expectedFeeUsd))

  console.warn(`[zrx] Disambiguated bare-integer integratorFee.amount`, {
    txHash: trade.transactionHash,
    assetId,
    amount,
    interpretation: isBaseUnits ? 'baseUnits' : 'decimal',
    expectedFeeUsd,
    usdIfDecimal,
    usdIfBaseUnits,
  })

  return isBaseUnits ? amount : decimalToBaseUnit(amount, precision)
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []

  for (const service of SERVICES) {
    let cursor: string | undefined

    do {
      const { data } = await withRetry(`zrx/${service}`, () =>
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
        const assetId = toAssetId(chainId, token)

        const asset = await assetDataService.getAsset(assetId)
        if (!asset) continue

        // 0x normally returns amounts in decimal format (e.g., "2.5" USDC, not "2500000" wei),
        // which we convert to base units for consistency with other integrations. But an
        // unpriced, bare-integer amount may already be in base units and needs resolving first
        const isSuspectBaseUnits = trade.fees.integratorFee?.amountUsd == null && isBareInteger(rawAmount)
        const amountBaseUnits = isSuspectBaseUnits
          ? await resolveBareIntegerAmountToBaseUnits(trade, rawAmount, assetId, asset.precision)
          : decimalToBaseUnit(rawAmount, asset.precision)

        if (!amountBaseUnits) continue

        fees.push({
          chainId,
          assetId,
          service: 'zrx',
          txHash: trade.transactionHash,
          timestamp: trade.timestamp,
          amount: amountBaseUnits,
          amountUsd: trade.fees.integratorFee?.amountUsd,
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

  return enrichFeesWithUsdPrices([...cachedFees, ...newFees, ...recentFees])
}
