import type { PartnerRevenue } from './partnerRevenue/types'

export const services = [
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
  unreconciled: { count: number; usd: number }
}

export interface PartnerRevenueResponse {
  byPartner: Record<string, PartnerRevenue>
  partnerTotalUsd: number
  affiliates: { partnerCode: string; bps: number; isActive: boolean }[]
}
