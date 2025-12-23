import { useQuery } from '@tanstack/react-query'
import { fetchAffiliateRevenue } from '../api/affiliateRevenue'
import type { DateRange } from '../types'

export function useAffiliateRevenue(dateRange: DateRange) {
  return useQuery({
    queryKey: ['affiliateRevenue', dateRange.startDate, dateRange.endDate],
    queryFn: () => fetchAffiliateRevenue(dateRange),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
