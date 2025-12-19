export type AffiliateRevenueResponse = {
  totalUsd: number
  byService: Record<string, number>
  failedProviders: string[]
}

export type DateRange = {
  startTimestamp: number
  endTimestamp: number
}

export type ServiceRevenue = {
  service: string
  amount: number
  percentage: number
}
