import { useQuery } from '@tanstack/react-query'

import { fetchPartnerRevenue } from '../api/partnerRevenue'
import type { DateRange } from '../types'

export function usePartnerRevenue(dateRange: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: ['partnerRevenue', dateRange.startDate, dateRange.endDate],
    queryFn: () => fetchPartnerRevenue(dateRange),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })
}
