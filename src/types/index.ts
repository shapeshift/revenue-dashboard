export type DailyRevenue = {
  totalUsd: number
  byService: Record<string, number>
}

export type AffiliateRevenueResponse = {
  totalUsd: number
  byService: Record<string, number>
  byDate: Record<string, DailyRevenue>
  failedProviders: string[]
}

export type DateRange = {
  startDate: string
  endDate: string
}

export type ServiceRevenue = {
  service: string
  amount: number
  percentage: number
}
