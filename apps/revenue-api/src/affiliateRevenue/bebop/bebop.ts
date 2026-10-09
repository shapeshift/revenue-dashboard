import axios from 'axios'

import { assetDataService } from '../../assetData/AssetDataService'
import { FEE_BPS_DENOMINATOR } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { buildAssetId, decimalToBaseUnit, getCachedFees } from '../utils'

import { BEBOP_API_KEY, BEBOP_API_URL, NANOSECONDS_PER_SECOND, SHAPESHIFT_REFERRER } from './constants'
import type { TradesResponse } from './types'

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []

  const start = startTimestamp * NANOSECONDS_PER_SECOND
  const end = endTimestamp * NANOSECONDS_PER_SECOND

  const { data } = await axios.get<TradesResponse>(BEBOP_API_URL, {
    params: { source: SHAPESHIFT_REFERRER, start, end },
    headers: { 'source-auth': BEBOP_API_KEY },
  })

  for (const trade of data.results) {
    if (!trade.partnerFeeBps || !trade.partnerFeeNative) continue

    const chainId = `eip155:${trade.chain_id}`
    const assetId = buildAssetId(chainId)

    const asset = await assetDataService.getAsset(assetId)
    if (!asset) continue

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
