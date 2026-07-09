import axios from 'axios'

import { MAP_CHAIN_ID } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { buildAssetId } from '../utils'

import {
  API_SUCCESS_CODE,
  BPS_DENOMINATOR,
  BUTTERSWAP_AFFILIATE_ID,
  isNativeAddress,
  MAP_USDT_ADDRESS,
  PAGE_SIZE,
  RELAY_STATE_SETTLED,
  REQUEST_TIMEOUT_MS,
  EVM_CHAIN_BY_SOURCE_CHAIN_ID,
  TRANSACTIONS_API,
  USDT_DECIMALS,
  VOLUME_USD_DECIMALS,
} from './constants'
import { resolveSameChainFee } from './resolveFee'
import type { ButterSwapTransaction, TransactionsResponse } from './types'

const LOOKUP_CONCURRENCY = 10

// Our affiliate's fee rate (bps) from the "26:60|9:4" affiliates string; 0 if absent/zero.
export const parseAffiliateBps = (affiliates: string | undefined, affiliateId: number): number => {
  if (!affiliates) return 0
  for (const part of affiliates.split('|')) {
    const [id, bps] = part.split(':')
    if (Number(id) === affiliateId) return Number(bps) || 0
  }
  return 0
}

// Affiliate fee in MAP USDT base units (18 dec) from the USD-normalized `volume` (6 dec) and bps.
// Integer math throughout: volume * bps * 10^(18-6) / 10^4 — no float, no precision loss.
export const computeFeeBaseUnits = (volume: string, bps: number): bigint => {
  const scale = BigInt(10) ** BigInt(USDT_DECIMALS - VOLUME_USD_DECIMALS)
  return (BigInt(volume) * BigInt(bps) * scale) / BigInt(BPS_DENOMINATOR)
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

// Cross-chain swaps collect the affiliate fee on the MAP relay; the API reports the rate (26:60) and
// we denominate in MAP USDT, matching the reconciled on-chain relay balance.
const crossChainFee = (tx: ButterSwapTransaction, mapUsdtAssetId: string): Fees | null => {
  const bps = parseAffiliateBps(tx.affiliates, BUTTERSWAP_AFFILIATE_ID)
  if (bps <= 0) return null

  if (tx.raw?.relayState !== RELAY_STATE_SETTLED) return null

  const amount = computeFeeBaseUnits(tx.volume, bps)
  if (amount <= BigInt(0)) return null

  const feeUsd = (Number(tx.volume) / 10 ** VOLUME_USD_DECIMALS) * (bps / BPS_DENOMINATOR)

  return {
    service: 'butterswap',
    amount: amount.toString(),
    amountUsd: feeUsd.toString(),
    chainId: MAP_CHAIN_ID,
    assetId: mapUsdtAssetId,
    timestamp: Math.floor(tx.sourceTime / 1000),
    txHash: tx.orderId,
  }
}

// Same-chain fees are taken on the source chain (API reports 26:0), so we read the actual amount
// on-chain and denominate in the source token. Never assume a rate — skip + warn if it can't be read.
const sameChainFee = async (tx: ButterSwapTransaction): Promise<Fees | null> => {
  const sourceChainId = String(tx.raw.sourceChainId)
  const volumeUsd = Number(tx.volume) / 10 ** VOLUME_USD_DECIMALS

  const { chainId } = EVM_CHAIN_BY_SOURCE_CHAIN_ID[sourceChainId] ?? {}
  if (!chainId) {
    console.warn(
      `[butterswap] UNCOUNTED same-chain fee on unsupported chain ${sourceChainId} — order ${tx.orderId}. Add ${sourceChainId} to EVM_CHAIN_BY_SOURCE_CHAIN_ID + non-EVM branch in resolveSameChainFee.`
    )
    return null
  }

  const amount = await resolveSameChainFee(sourceChainId, tx.raw.sourceHash, tx.raw.sourceTokenAddress)

  if (amount === null) {
    console.warn(
      `[butterswap] UNCOUNTED same-chain fee: no on-chain read for order ${tx.orderId} on chain ${sourceChainId}.`
    )
    return null
  }

  if (amount <= BigInt(0)) {
    console.warn(
      `[butterswap] UNCOUNTED same-chain fee: no transfer to a known receiver for order ${tx.orderId} on chain ${sourceChainId}. Receiver may have rotated — add it to SAME_CHAIN_FEE_RECEIVERS.`
    )
    return null
  }

  const assetId = buildAssetId(
    chainId,
    isNativeAddress(tx.raw.sourceTokenAddress) ? undefined : tx.raw.sourceTokenAddress
  )

  // Emit the real source-chain token; enrichment values it at current price. Don't derive USD from
  // the API `volume` (0 on many older records) — it's only a fallback originalUsdValue when present.
  const sourceAmount = Number(tx.raw.sourceAmount || '0')
  const originalUsd =
    volumeUsd > 0 && sourceAmount > 0 ? (volumeUsd * (Number(amount) / sourceAmount)).toString() : undefined

  return {
    service: 'butterswap',
    amount: amount.toString(),
    amountUsd: originalUsd,
    chainId,
    assetId,
    timestamp: Math.floor(tx.sourceTime / 1000),
    txHash: tx.raw.sourceHash || tx.orderId,
  }
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  const startTime = Date.now()

  const startMs = startTimestamp * 1000
  const endMs = endTimestamp * 1000
  const transactions = await fetchTransactions(startMs, endMs)

  const mapUsdtAssetId = buildAssetId(MAP_CHAIN_ID, MAP_USDT_ADDRESS)
  const fees: Fees[] = []
  const sameChainTxs: ButterSwapTransaction[] = []

  const seen = new Set<string>()
  let crossCount = 0
  for (const tx of transactions) {
    if (tx.sourceTime < startMs || tx.sourceTime > endMs) continue
    if (seen.has(tx.orderId)) continue
    seen.add(tx.orderId)

    if (String(tx.raw.sourceChainId) === String(tx.raw.destinationChainId)) {
      sameChainTxs.push(tx)
      continue
    }

    const fee = crossChainFee(tx, mapUsdtAssetId)
    if (fee) {
      fees.push(fee)
      crossCount++
    }
  }

  let sameChainCount = 0
  for (let i = 0; i < sameChainTxs.length; i += LOOKUP_CONCURRENCY) {
    const results = await Promise.all(sameChainTxs.slice(i, i + LOOKUP_CONCURRENCY).map(sameChainFee))
    for (const fee of results) {
      if (!fee) continue
      fees.push(fee)
      sameChainCount++
    }
  }

  const duration = Date.now() - startTime
  console.log(
    `[butterswap] Total: ${fees.length} fees (${crossCount} cross-chain, ${sameChainCount} same-chain on-chain) from ${transactions.length} txns in ${duration}ms`
  )

  return enrichFeesWithUsdPrices(fees)
}
