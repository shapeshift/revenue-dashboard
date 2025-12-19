import { useState } from 'react'
import { subDays, startOfDay, endOfDay } from 'date-fns'
import { useAffiliateRevenue } from './hooks/useAffiliateRevenue'
import { TotalRevenue } from './components/TotalRevenue'
import { DateRangePicker } from './components/DateRangePicker'
import { ServiceBreakdown } from './components/ServiceBreakdown'
import type { DateRange } from './types'

function getDefaultDateRange(): DateRange {
  const now = new Date()
  const start = startOfDay(subDays(now, 30))
  const end = endOfDay(now)
  return {
    startTimestamp: Math.floor(start.getTime() / 1000),
    endTimestamp: Math.floor(end.getTime() / 1000),
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
