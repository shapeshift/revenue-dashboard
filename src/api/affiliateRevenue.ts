import type { AffiliateRevenueResponse, DateRange } from '../types'
import { mockRevenueData } from './mockData'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.proxy.shapeshift.com'
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

export async function fetchAffiliateRevenue(dateRange: DateRange): Promise<AffiliateRevenueResponse> {
  if (USE_MOCK_DATA) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return mockRevenueData
  }

  const url = new URL('/api/v1/affiliate/revenue', API_BASE_URL)
  url.searchParams.set('startTimestamp', dateRange.startTimestamp.toString())
  url.searchParams.set('endTimestamp', dateRange.endTimestamp.toString())

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}
