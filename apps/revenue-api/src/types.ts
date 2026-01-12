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
  byService: Record<Service, number>
}

export interface DailyRevenue {
  totalUsd: number
  byService: Record<Service, number>
  byAsset?: Record<string, AssetRevenue>
}

export interface AffiliateRevenueResponse {
  totalUsd: number
  byService: Record<Service, number>
  byDate: Record<string, DailyRevenue>
  byAsset?: Record<string, AssetRevenue>
  failedProviders: Service[]
}
