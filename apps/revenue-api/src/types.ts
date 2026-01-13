export const services = [
  'bebop',
  'butterswap',
  'chainflip',
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
  byService: Record<Service, number>
}

export interface DailyRevenue {
  totalUsd: number
  totalVolumeUsd: number
  byService: Record<Service, number>
  byServiceVolume: Record<Service, number>
  byAsset?: Record<string, AssetRevenue>
}

export interface AffiliateRevenueResponse {
  totalUsd: number
  totalVolumeUsd: number
  byService: Record<Service, number>
  byServiceVolume: Record<Service, number>
  byDate: Record<string, DailyRevenue>
  byAsset?: Record<string, AssetRevenue>
  failedProviders: Service[]
}
