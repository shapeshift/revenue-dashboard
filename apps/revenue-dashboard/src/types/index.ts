export type AssetRevenue = {
  symbol: string
  chainId: string
  chainName: string
  assetId: string
  tokenAmount: string
  amountUsd: number
  volumeUsd: number
  byService: Record<string, number>
}

export type DailyRevenue = {
  totalUsd: number
  totalVolumeUsd: number
  byService: Record<string, number>
  byServiceVolume: Record<string, number>
  byAsset?: Record<string, AssetRevenue>
}

export type AffiliateRevenueResponse = {
  totalUsd: number
  totalVolumeUsd: number
  byService: Record<string, number>
  byServiceVolume: Record<string, number>
  byDate: Record<string, DailyRevenue>
  byAsset?: Record<string, AssetRevenue>
  failedProviders: string[]
}

export type DateRange = {
  startDate: string
  endDate: string
}

export type ServiceRevenue = {
  service: string
  amount: number
  volume: number
  percentage: number
}
