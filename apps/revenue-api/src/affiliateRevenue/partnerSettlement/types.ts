import type { Fees } from '../index'

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
  byService: Record<string, number> // raw swapperName -> usd
  byDate: Record<string, number> // date -> usd
}

export type SettlementResult = {
  netFees: Fees[]
  byPartner: Record<string, PartnerRevenue>
  partnerTotalUsd: number
  unreconciled: { count: number; usd: number }
}
