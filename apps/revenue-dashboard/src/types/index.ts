export type {
  AffiliateRevenueResponse,
  AssetRevenue,
  DailyRevenue,
  PartnerRevenue,
  PartnerRevenueResponse,
  Service,
} from '@shapeshiftoss/revenue-api/types'

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
