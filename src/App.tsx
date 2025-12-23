import { useState } from 'react'
import { subDays, format } from 'date-fns'
import { useAffiliateRevenue } from './hooks/useAffiliateRevenue'
import { TotalRevenue } from './components/TotalRevenue'
import { DateRangePicker } from './components/DateRangePicker'
import { ServiceBreakdown } from './components/ServiceBreakdown'
import { RevenueTimeSeries } from './components/RevenueTimeSeries'
import type { DateRange } from './types'

function getDefaultDateRange(): DateRange {
  // Default to 30 days ending yesterday (to avoid fetching today's incomplete/slow data)
  const yesterday = subDays(new Date(), 1)
  const start = subDays(yesterday, 29) // 30 total days including yesterday
  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(yesterday, 'yyyy-MM-dd'),
  }
}

function App() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange)

  const { data, isLoading, isError, error } = useAffiliateRevenue(dateRange)

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">ShapeShift Revenue Dashboard</h1>
          <p className="text-zinc-400">Affiliate revenue from swap providers</p>
        </header>

        <div className="mb-8">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {isError && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/50 border border-red-700 text-red-200">
            <p className="font-medium">Error loading revenue data</p>
            <p className="text-sm text-red-300">{error?.message || 'Unknown error'}</p>
          </div>
        )}

        {data?.failedProviders && data.failedProviders.length > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-amber-900/50 border border-amber-700 text-amber-200">
            <p className="font-medium">Some providers failed to respond</p>
            <p className="text-sm text-amber-300">
              {data.failedProviders.join(', ')}
            </p>
          </div>
        )}

        <div className="space-y-6">
          <TotalRevenue amount={data?.totalUsd} isLoading={isLoading} />
          <RevenueTimeSeries byDate={data?.byDate} isLoading={isLoading} />
          <ServiceBreakdown
            byService={data?.byService}
            totalUsd={data?.totalUsd}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  )
}

export default App
