import axios from 'axios'

import { MAP_CHAIN_ID } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { buildAssetId, getCachedFees, getTreasuryFees, settleChains } from '../utils'

import {
  API_SUCCESS_CODE,
  BUTTERSWAP_AFFILIATE_ID,
  MAP_RELAY_CHAIN_ID,
  PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
  SAME_CHAIN_CHAIN_IDS,
  SAME_CHAIN_FEE_RECEIVERS,
  SAME_CHAIN_ROUTERS,
  TRANSACTIONS_API,
  USD_DECIMALS,
} from './constants'
import type { AffiliateFee, ButterSwapTransaction, TransactionsResponse } from './types'

// Order timestamps are ISO-8601 strings; tolerate epoch ms in case the field flips back.
export const parseOrderTimeMs = (value: string | number | undefined): number => {
  if (value === undefined || value === null || value === '') return NaN
  return typeof value === 'number' ? value : Date.parse(value)
}

// Our fee row for an order. The API writes one row per affiliate, so pick ours by id.
const selectAffiliateFee = (tx: ButterSwapTransaction, affiliateId: number): AffiliateFee | null =>
  tx.affiliateFees?.find(fee => Number(fee.affiliateId) === affiliateId) ?? null

// USD value at the time of the swap: fee (token base units) × the row's token price (6 decimals).
// NaN when the row is missing a price or decimals — callers must not emit that as a USD string.
const affiliateFeeUsd = (row: AffiliateFee): number =>
  (Number(row.fee) / 10 ** row.token.decimals) * (Number(row.price) / 10 ** USD_DECIMALS)

// Amounts arrive as integer strings; BigInt throws on anything else (a decimal point, an exponent).
// Null rather than throw: an unparseable row is one skipped order, not a reason to abort the batch
// and take the whole provider down with it.
const parseFeeAmount = (fee: string | undefined): bigint | null => {
  try {
    return BigInt(fee || '0')
  } catch {
    return null
  }
}

const fetchTransactions = async (startMs: number, endMs: number): Promise<ButterSwapTransaction[]> => {
  const items: ButterSwapTransaction[] = []

  for (let page = 1; ; page++) {
    const { data } = await axios.get<TransactionsResponse>(TRANSACTIONS_API, {
      params: { page, size: PAGE_SIZE, affiliate: BUTTERSWAP_AFFILIATE_ID, start: startMs, end: endMs },
      timeout: REQUEST_TIMEOUT_MS,
    })

    if (data.errno !== API_SUCCESS_CODE || !data.data) {
      throw new Error(`ButterSwap transactions API error: errno=${data.errno} ${data.message}`)
    }

    items.push(...data.data.items)
    if (page >= data.data.pages) break
  }

  return items
}

// Cross-chain fees are charged on the MAP relay chain in whichever token the swap bridged through
// (mapped USDC/USDT/ETH/BTC — all 18 decimals). Take the fee row verbatim rather than deriving it
// from `volume × rate`: the reported rate doesn't reproduce the charged fee on every order, and the
// row names the token that actually hit the relay.
export const crossChainFee = (tx: ButterSwapTransaction, timestamp: number): Fees | null => {
  const row = selectAffiliateFee(tx, BUTTERSWAP_AFFILIATE_ID)

  if (!row) {
    console.warn(
      `[butterswap] UNCOUNTED cross-chain fee: no affiliate ${BUTTERSWAP_AFFILIATE_ID} fee row for order ${tx.orderId}.`
    )
    return null
  }

  const amount = parseFeeAmount(row.fee)
  if (amount === null) {
    console.warn(`[butterswap] UNCOUNTED cross-chain fee: unparseable fee "${row.fee}" for order ${tx.orderId}.`)
    return null
  }

  // 0bps orders carry a zero row — nothing was charged, nothing to count.
  if (amount <= BigInt(0)) return null

  // The row is written by the relay tx that charges the fee, so a missing hash means it never settled.
  if (!row.hash) return null

  if (String(row.token.chainId) !== MAP_RELAY_CHAIN_ID) {
    console.warn(
      `[butterswap] UNCOUNTED cross-chain fee on unexpected chain ${row.token.chainId} — order ${tx.orderId}. Fees are expected on the MAP relay chain (${MAP_RELAY_CHAIN_ID}).`
    )
    return null
  }

  // A nonzero fee is never worth exactly $0, so treat NaN (missing price/decimals) and 0 alike:
  // the row just doesn't price itself. Emit no USD and let enrichment price it from the assetId —
  // "NaN" would poison the dashboard totals, which parseFloat and sum these, and "0" would
  // understate the fee wherever the fallback is used.
  const feeUsd = affiliateFeeUsd(row)
  const hasUsableUsd = feeUsd > 0
  if (!hasUsableUsd) {
    console.warn(
      `[butterswap] no usable USD for order ${tx.orderId} (price "${row.price}", decimals ${row.token.decimals}) — pricing from the asset instead.`
    )
  }

  return {
    service: 'butterswap',
    amount: amount.toString(),
    amountUsd: hasUsableUsd ? feeUsd.toString() : undefined,
    chainId: MAP_CHAIN_ID,
    assetId: buildAssetId(MAP_CHAIN_ID, row.token.address),
    timestamp,
    txHash: row.hash,
  }
}

// Each receiver's slice of the window, skipping receivers that weren't being paid in it
export const receiverRanges = (start: number, end: number) =>
  SAME_CHAIN_FEE_RECEIVERS.map(({ address, from, until = Infinity }) => ({
    address,
    start: Math.max(start, from),
    end: Math.min(end, until),
  })).filter(range => range.start <= range.end)

const getSameChainFees = async (chainId: string, startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fetchRange = async (start: number, end: number) => {
    const perReceiver = await Promise.all(
      receiverRanges(start, end).map(range =>
        getTreasuryFees({
          service: 'butterswap',
          chainId,
          treasury: range.address,
          senders: SAME_CHAIN_ROUTERS,
          startTimestamp: range.start,
          endTimestamp: range.end,
        })
      )
    )
    return perReceiver.flat()
  }

  const { fees } = await getCachedFees('butterswap', chainId, startTimestamp, endTimestamp, fetchRange)

  return fees
}

const getCrossChainFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startMs = startTimestamp * 1000
  const endMs = endTimestamp * 1000
  const transactions = await fetchTransactions(startMs, endMs)

  const fees: Fees[] = []
  const seen = new Set<string>()

  for (const tx of transactions) {
    // The API's window is fuzzy at the upper bound (it can return orders sent after `end`), so
    // filter on the order's own send time.
    const sourceMs = parseOrderTimeMs(tx.sendTime ?? tx.raw?.sourceTime)
    if (Number.isNaN(sourceMs)) {
      console.warn(`[butterswap] UNCOUNTED: unparseable send time "${tx.sendTime}" for order ${tx.orderId}.`)
      continue
    }
    if (sourceMs < startMs || sourceMs > endMs) continue
    if (seen.has(tx.orderId)) continue
    seen.add(tx.orderId)

    // same-chain fees are counted from the receiver inflows instead
    if (String(tx.raw.sourceChainId) === String(tx.raw.destinationChainId)) continue

    const fee = crossChainFee(tx, Math.floor(sourceMs / 1000))
    if (fee) fees.push(fee)
  }

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const startTime = Date.now()

  const [crossChainFees, sameChainFees] = await Promise.all([
    getCrossChainFees(startTimestamp, endTimestamp),
    settleChains(
      'butterswap',
      SAME_CHAIN_CHAIN_IDS,
      chainId => chainId,
      chainId => getSameChainFees(chainId, startTimestamp, endTimestamp)
    ).then(perChain => perChain.flat()),
  ])

  const fees = [...crossChainFees, ...sameChainFees]

  const duration = Date.now() - startTime
  console.log(
    `[butterswap] Total: ${fees.length} fees (${crossChainFees.length} cross-chain, ${sameChainFees.length} same-chain) in ${duration}ms`
  )

  return enrichFeesWithUsdPrices(fees)
}
