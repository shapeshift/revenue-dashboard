import type { DateRange, PartnerRevenueResponse } from '../types'

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL
if (!API_BASE_URL) throw new Error('VITE_API_BASE_URL is required')

export async function fetchPartnerRevenue(dateRange: DateRange): Promise<PartnerRevenueResponse> {
  const url = new URL('/api/v1/partner/revenue', API_BASE_URL)
  url.searchParams.set('startDate', dateRange.startDate)
  url.searchParams.set('endDate', dateRange.endDate)

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as PartnerRevenueResponse
}
