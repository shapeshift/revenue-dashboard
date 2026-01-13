import type { AffiliateRevenueResponse, DateRange } from '../types'

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || 'https://api.proxy.shapeshift.com'

export async function fetchAffiliateRevenue(dateRange: DateRange): Promise<AffiliateRevenueResponse> {
  const url = new URL('/api/v1/affiliate/revenue', API_BASE_URL)
  url.searchParams.set('startDate', dateRange.startDate)
  url.searchParams.set('endDate', dateRange.endDate)

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as AffiliateRevenueResponse
}
