import axios from 'axios'

import { assetDataService } from '../../assetData/AssetDataService'
import { withRetry } from '../../utils/retry'
import { FEE_BPS_DENOMINATOR } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { buildAssetId, decimalToBaseUnit, getCachedFees } from '../utils'

import {
  BEBOP_API_KEY,
  BEBOP_API_URL,
  NANOSECONDS_PER_SECOND,
  REQUEST_TIMEOUT_MS,
  SHAPESHIFT_REFERRER,
} from './constants'
import type { Trade, TradesResponse } from './types'
import { isChargedTrade, nextPageEnd, toChainId } from './utils'

// Results come newest first, at most 500 per request; nextAvailableTimestamp is the inclusive end of the next page
const fetchTrades = async (startTimestamp: number, endTimestamp: number): Promise<Trade[]> => {
  const start = BigInt(startTimestamp) * BigInt(NANOSECONDS_PER_SECOND)
  let end: bigint | undefined = BigInt(endTimestamp) * BigInt(NANOSECONDS_PER_SECOND)
  const trades = new Map<string, Trade>()

  while (end !== undefined) {
    const cursor = end
    const { data } = await withRetry('bebop/trades', () =>
      axios.get<TradesResponse>(BEBOP_API_URL, {
        params: { source: SHAPESHIFT_REFERRER, start: start.toString(), end: cursor.toString() },
        headers: { 'source-auth': BEBOP_API_KEY },
        timeout: REQUEST_TIMEOUT_MS,
      })
    )

    // keyed on the whole row so a trade repeated across a page boundary counts once
    for (const trade of data.results) trades.set(JSON.stringify(trade), trade)

    end = nextPageEnd(data.nextAvailableTimestamp, cursor, start)
  }

  return [...trades.values()]
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []
  const trades = await fetchTrades(startTimestamp, endTimestamp)

  for (const trade of trades) {
    if (!isChargedTrade(trade)) continue

    const chainId = toChainId(trade.chain_id)
    const assetId = buildAssetId(chainId)

    const asset = await assetDataService.getAsset(assetId)
    if (!asset) {
      console.warn(`[bebop] UNCOUNTED fee: no asset for ${assetId} (chain_id ${trade.chain_id}, tx ${trade.txHash})`)
      continue
    }

    const amount = decimalToBaseUnit(String(trade.partnerFeeNative), asset.precision)

    fees.push({
      chainId,
      assetId,
      service: 'bebop',
      txHash: trade.txHash,
      timestamp: Math.floor(new Date(trade.timestamp).getTime() / 1000),
      amount,
      amountUsd:
        trade.volumeUsd !== undefined
          ? String(trade.volumeUsd * (Number(trade.partnerFeeBps) / FEE_BPS_DENOMINATOR))
          : undefined,
    })
  }

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()
  const { fees, cacheHits, cacheMisses } = await getCachedFees(
    'bebop',
    'all',
    startTimestamp,
    endTimestamp,
    fetchFeesFromAPI
  )

  console.log(
    `[bebop] Total: ${fees.length} fees in ${Date.now() - startTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return enrichFeesWithUsdPrices(fees)
}
