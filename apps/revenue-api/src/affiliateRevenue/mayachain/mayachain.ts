import axios from 'axios'

import { withRetry } from '../../utils/retry'
import { MAYACHAIN_CHAIN_ID, STREAMING_SWAP_SETTLE_SECONDS } from '../constants'
import { getHistoricalPriceUsd } from '../historicalPrices'
import type { Fees } from '../types'
import { buildAssetId, fetchMidgardHourlyHistory, getCachedFees } from '../utils'

import {
  CACAO_ASSET,
  MIDGARD_AFFILIATE,
  MIDGARD_BASE_URL,
  MIDGARD_PAGE_LIMIT,
  BTC_ASSET_ID,
  BTC_POOL,
} from './constants'
import type { DepthHistoryItem, MidgardAction, MidgardActionsResponse } from './types'

// BTC's price in CACAO from the deep, arbitraged BTC pool; the thin stablecoin pools drift too far from $1 to anchor USD
const fetchBtcCacaoPriceLookup = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<(timestamp: number) => number | undefined> => {
  const history = await fetchMidgardHourlyHistory<DepthHistoryItem>(
    'mayachain/midgard-btcPool',
    `${MIDGARD_BASE_URL}/history/depths/${BTC_POOL}`,
    startTimestamp,
    endTimestamp
  )

  const intervals = history
    .map(({ startTime, assetPrice }) => ({ startTime: Number(startTime), priceCacao: Number(assetPrice) }))
    .filter(i => i.priceCacao > 0)

  return (timestamp: number): number | undefined =>
    (intervals.filter(i => i.startTime <= timestamp).at(-1) ?? intervals[0])?.priceCacao
}

// CACAO/USD = BTC/USD at that time / BTC's price in CACAO; a failed BTC fetch throws like a failed Midgard request,
// so the day is retried rather than cached unpriced
const getCacaoPriceUsd = async (btcCacaoPrice: number | undefined, timestamp: number): Promise<number | undefined> => {
  if (!btcCacaoPrice) return undefined
  const btcPriceUsd = await getHistoricalPriceUsd(BTC_ASSET_ID, timestamp, { throwOnFetchError: true })
  return btcPriceUsd === null ? undefined : btcPriceUsd / btcCacaoPrice
}

const actionTimestamp = (action: MidgardAction): number => Math.floor(Number(action.date) / 1_000_000_000)

// mayachain midgard's fromTimestamp param expects nanoseconds (unlike thorchain's seconds) and
// pages unstably when combined with timestamp, so page descending under timestamp (seconds) only
// and bound the lower edge of the window client-side. timestamp cuts at exactly endTimestamp*1e9
// nanoseconds, which would drop final-second fees — pass endTimestamp+1 and let the client-side
// filter trim to the window
const fetchMidgardActions = async (startTimestamp: number, endTimestamp: number): Promise<MidgardAction[]> => {
  const actions: MidgardAction[] = []

  let offset = 0
  while (true) {
    const { data } = await withRetry('mayachain/midgard-actions', () =>
      axios.get<MidgardActionsResponse>(`${MIDGARD_BASE_URL}/actions`, {
        params: {
          affiliate: MIDGARD_AFFILIATE,
          timestamp: endTimestamp + 1,
          limit: MIDGARD_PAGE_LIMIT,
          offset,
        },
      })
    )

    const batch = data.actions ?? []
    actions.push(...batch)

    if (batch.length < MIDGARD_PAGE_LIMIT) break

    const oldest = batch[batch.length - 1]
    if (actionTimestamp(oldest) < startTimestamp) break

    offset += MIDGARD_PAGE_LIMIT
  }

  return actions.filter(a => {
    const ts = actionTimestamp(a)
    return ts >= startTimestamp && ts <= endTimestamp
  })
}

const fetchFeesFromMidgard = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const [getBtcCacaoPrice, allActions] = await Promise.all([
    fetchBtcCacaoPriceLookup(startTimestamp, endTimestamp),
    fetchMidgardActions(startTimestamp, endTimestamp),
  ])

  const chainId = MAYACHAIN_CHAIN_ID
  const assetId = buildAssetId(chainId)
  const fees: Fees[] = []

  for (const action of allActions) {
    const affiliateOut = action.out.find(o => o.affiliate === true)
    const affiliateCoin = affiliateOut?.coins?.[0]
    if (!affiliateCoin) continue

    const inTxId = action.in[0]?.txID
    if (!inTxId) continue

    if (affiliateCoin.asset !== CACAO_ASSET) {
      console.warn(`[mayachain] Skipping non-CACAO affiliate payout ${affiliateCoin.asset} (tx ${inTxId})`)
      continue
    }

    const cacaoAmount = affiliateCoin.amount
    const timestamp = actionTimestamp(action)

    const cacaoPrice = await getCacaoPriceUsd(getBtcCacaoPrice(timestamp), timestamp)
    const amountUsd = cacaoPrice !== undefined ? ((Number(cacaoAmount) / 1e10) * cacaoPrice).toString() : undefined

    fees.push({
      chainId,
      assetId,
      service: 'mayachain',
      txHash: inTxId,
      timestamp,
      amount: cacaoAmount,
      amountUsd,
    })
  }

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()
  const { fees, cacheHits, cacheMisses } = await getCachedFees(
    'mayachain',
    MAYACHAIN_CHAIN_ID,
    startTimestamp,
    endTimestamp,
    fetchFeesFromMidgard,
    STREAMING_SWAP_SETTLE_SECONDS
  )

  console.log(
    `[mayachain] Total: ${fees.length} fees in ${Date.now() - startTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return fees
}
