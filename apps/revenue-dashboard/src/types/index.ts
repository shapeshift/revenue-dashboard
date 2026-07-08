export type AssetRevenue = {
  symbol: string
  chainId: string
  chainName: string
  assetId: string
  tokenAmount: string
  amountUsd: number
  volumeUsd: number
  feeCount: number
  byService: Record<string, number>
  byServiceFeeCount: Record<string, number>
}

export type DailyRevenue = {
  totalUsd: number
  totalVolumeUsd: number
  totalFeeCount: number
  byService: Record<string, number>
  byServiceVolume: Record<string, number>
  byServiceFeeCount: Record<string, number>
  byAsset?: Record<string, AssetRevenue>
}

export type AffiliateRevenueResponse = {
  totalUsd: number
  totalVolumeUsd: number
  totalFeeCount: number
  byService: Record<string, number>
  byServiceVolume: Record<string, number>
  byServiceFeeCount: Record<string, number>
  byDate: Record<string, DailyRevenue>
  byAsset?: Record<string, AssetRevenue>
  failedProviders: string[]
}

export type PartnerRevenue = {
  partnerCode: string
  totalUsd: number
  totalVolumeUsd: number
  swapCount: number
  byService: Record<string, number>
  byDate: Record<string, number>
}

export type PartnerRevenueResponse = {
  byPartner: Record<string, PartnerRevenue>
  partnerTotalUsd: number
  affiliates: { partnerCode: string; bps: number; isActive: boolean }[]
}

export type DateRange = {
  startDate: string
  endDate: string
}

export type ServiceRevenue = {
  service: string
  amount: number
  volume: number
  feeCount: number
  percentage: number
}
