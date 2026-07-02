import { useQuery } from '@tanstack/react-query'

import { fetchPartnerRevenue } from '../api/partnerRevenue'
import type { DateRange } from '../types'

// Fetched eagerly alongside the revenue query (not gated on the active tab) so switching to the
// Partners view reads react-query's cache for the same date range instead of triggering a refetch.
export function usePartnerRevenue(dateRange: DateRange) {
  return useQuery({
    queryKey: ['partnerRevenue', dateRange.startDate, dateRange.endDate],
    queryFn: () => fetchPartnerRevenue(dateRange),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
