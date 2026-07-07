import axios from 'axios'

import { assetDataService } from '../assetData/AssetDataService'
import type { AffiliateRevenueResponse, PartnerRevenueResponse, Service } from '../types'
import { timestampToDate } from '../utils/date'

import { aggregateAffiliateRevenue, aggregatePartnerRevenue } from './aggregateRevenue'
import * as avnu from './avnu'
import * as bebop from './bebop'
import * as bobgateway from './bobgateway'
import * as butterswap from './butterswap'
import * as chainflip from './chainflip'
import * as cowswap from './cowswap'
import * as jupiter from './jupiter'
import * as mayachain from './mayachain'
import * as nearintents from './nearIntents'
import * as portals from './portals'
import { reconcilePartnerRevenue } from './reconcileRevenue'
import * as relay from './relay'
import { fetchPartners, fetchPartnerSwaps } from './swapServiceClient'
import * as thorchain from './thorchain'
import type { ExcludedPartnerSwap, Fees, ReconciliationResult } from './types'
import * as zrx from './zrx'

const providerNames: Service[] = [
  'avnu',
  'bebop',
  'bobgateway',
  'butterswap',
  'chainflip',
  'cowswap',
  'jupiter',
  'mayachain',
  'nearintents',
  'portals',
  'relay',
  'thorchain',
  'zrx',
]

const formatError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 'no response'
    const data = error.response?.data
    const message = typeof data === 'object' ? JSON.stringify(data) : (data ?? error.message)
    return `HTTP ${status}: ${message}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

const logExcludedPartnerSwaps = (context: string, excluded: ExcludedPartnerSwap[]): void => {
  if (excluded.length === 0) return

  const byReason = new Map<string, ExcludedPartnerSwap[]>()
  for (const swap of excluded) {
    const list = byReason.get(swap.reason) ?? []
    list.push(swap)
    byReason.set(swap.reason, list)
  }

  // Biggest $ impact first — that's what tells you whether revenue is materially off.
  const groups = [...byReason.entries()]
    .map(([reason, swaps]) => ({ reason, swaps, usd: swaps.reduce((sum, s) => sum + s.partnerFeeUsd, 0) }))
    .sort((a, b) => b.usd - a.usd)

  const total = groups.reduce((sum, g) => sum + g.usd, 0)
  console.warn(`[${context}] ${excluded.length} partner swap(s) excluded from revenue — $${total.toFixed(2)} total`)

  for (const { reason, swaps, usd } of groups) {
    // Swapper breakdown surfaces systematic gaps (e.g. a whole swapper that never emits an on-chain fee).
    const bySwapper = new Map<string, number>()
    for (const s of swaps) bySwapper.set(s.swapperName, (bySwapper.get(s.swapperName) ?? 0) + 1)
    const swappers = [...bySwapper.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} ×${count}`)
      .join(', ')

    console.warn(`  • $${usd.toFixed(2)} — ${reason} — ${swaps.length} swap(s): ${swappers}`)
  }
}

export class AffiliateRevenue {
  private async collectFees(
    startTimestamp: number,
    endTimestamp: number
  ): Promise<{ fees: Fees[]; failedProviders: Service[] }> {
    const fees: Array<Fees> = []
    const failedProviders: Service[] = []

    const results = await Promise.allSettled([
      avnu.getFees(startTimestamp, endTimestamp),
      bebop.getFees(startTimestamp, endTimestamp),
      bobgateway.getFees(startTimestamp, endTimestamp),
      butterswap.getFees(startTimestamp, endTimestamp),
      chainflip.getFees(startTimestamp, endTimestamp),
      cowswap.getFees(startTimestamp, endTimestamp),
      jupiter.getFees(startTimestamp, endTimestamp),
      mayachain.getFees(startTimestamp, endTimestamp),
      nearintents.getFees(startTimestamp, endTimestamp),
      portals.getFees(startTimestamp, endTimestamp),
      relay.getFees(startTimestamp, endTimestamp),
      thorchain.getFees(startTimestamp, endTimestamp),
      zrx.getFees(startTimestamp, endTimestamp),
    ])

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        fees.push(...result.value)
      } else {
        const provider = providerNames[index]
        failedProviders.push(provider)
        console.error(`[AffiliateRevenue] ${provider} failed: ${formatError(result.reason)}`)
      }
    })

    return { fees, failedProviders }
  }

  private async reconcile(
    fees: Fees[],
    failedProviders: Service[],
    startTimestamp: number,
    endTimestamp: number
  ): Promise<ReconciliationResult> {
    const startDate = timestampToDate(startTimestamp)
    const endDate = timestampToDate(endTimestamp)

    const partnerSwaps = await fetchPartnerSwaps(startDate, endDate)

    return reconcilePartnerRevenue(fees, partnerSwaps, failedProviders)
  }

  async getAffiliateRevenue(startTimestamp: number, endTimestamp: number): Promise<AffiliateRevenueResponse> {
    assetDataService.resetMissLog()

    const { fees, failedProviders } = await this.collectFees(startTimestamp, endTimestamp)
    const reconciliation = await this.reconcile(fees, failedProviders, startTimestamp, endTimestamp)

    logExcludedPartnerSwaps('AffiliateRevenue', reconciliation.excluded)

    return aggregateAffiliateRevenue(reconciliation.netFees, failedProviders, assetId =>
      assetDataService.getAsset(assetId)
    )
  }

  async getPartnerRevenue(startTimestamp: number, endTimestamp: number): Promise<PartnerRevenueResponse> {
    const startDate = timestampToDate(startTimestamp)
    const endDate = timestampToDate(endTimestamp)

    const [partnerSwaps, affiliates] = await Promise.all([
      fetchPartnerSwaps(startDate, endDate).catch((error: unknown) => {
        console.error(`[PartnerRevenue] partner swaps fetch failed: ${formatError(error)}`)
        return []
      }),
      fetchPartners().catch((error: unknown) => {
        console.error(`[PartnerRevenue] registry fetch failed: ${formatError(error)}`)
        return []
      }),
    ])

    const { response, excluded } = aggregatePartnerRevenue(partnerSwaps, affiliates)
    logExcludedPartnerSwaps('PartnerRevenue', excluded)
    return response
  }
}
