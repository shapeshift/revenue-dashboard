import type { Fees } from '../affiliateRevenue/index'

export type PartnerSwapRow = {
  partnerCode: string
  swapperName: string
  sellTxHash: string | null
  buyTxHash: string | null
  partnerBps: number
  affiliateBps: number | null
  feeUsd: number | null
  partnerFeeUsd: number | null
  volumeUsd: number | null
  date: string
}

export type PartnerRevenue = {
  partnerCode: string
  totalUsd: number
  totalVolumeUsd: number
  swapCount: number
  byService: Record<string, number>
  byDate: Record<string, number>
}

export type SettlementResult = {
  netFees: Fees[]
  unreconciled: { count: number; usd: number }
}
