export const services = [
  'across',
  'avnu',
  'bebop',
  'bobgateway',
  'butterswap',
  'chainflip',
  'cowswap',
  'debridge',
  'fynd',
  'mayachain',
  'nearintents',
  'portals',
  'relay',
  'symbiosis',
  'thorchain',
  'zrx',
] as const

export type Service = (typeof services)[number]

export interface AssetRevenue {
  symbol: string
  chainId: string
  chainName: string
  assetId: string
  tokenAmount: string
  amountUsd: number
  volumeUsd: number
  feeCount: number
  byService: Record<Service, number>
  byServiceFeeCount: Record<Service, number>
}

export interface DailyRevenue {
  totalUsd: number
  totalVolumeUsd: number
  totalFeeCount: number
  byService: Record<Service, number>
  byServiceVolume: Record<Service, number>
  byServiceFeeCount: Record<Service, number>
  byAsset?: Record<string, AssetRevenue>
}

export interface AffiliateRevenueResponse {
  totalUsd: number
  totalVolumeUsd: number
  totalFeeCount: number
  byService: Record<Service, number>
  byServiceVolume: Record<Service, number>
  byServiceFeeCount: Record<Service, number>
  byDate: Record<string, DailyRevenue>
  byAsset?: Record<string, AssetRevenue>
  failedProviders: Service[]
}

export interface PartnerRevenue {
  partnerCode: string
  totalUsd: number
  shapeshiftUsd: number
  totalVolumeUsd: number
  swapCount: number
  byService: Record<string, number>
  byDate: Record<string, number>
}

export interface PartnerRevenueResponse {
  byPartner: Record<string, PartnerRevenue>
  partnerTotalUsd: number
  shapeshiftTotalUsd: number
  affiliates: { partnerCode: string; bps: number; isActive: boolean }[]
}
