import { useState } from 'react'

import { AssetBreakdown } from './components/AssetBreakdown'
import { DateRangePicker } from './components/DateRangePicker'
import { PartnerBreakdown } from './components/PartnerBreakdown'
import { ServiceBreakdown } from './components/ServiceBreakdown'
import { ServiceStackedBarChart } from './components/ServiceStackedBarChart'
import { TotalFees } from './components/TotalFees'
import { TotalRevenue } from './components/TotalRevenue'
import { TotalVolume } from './components/TotalVolume'
import { useAffiliateRevenue } from './hooks/useAffiliateRevenue'
import { usePartnerRevenue } from './hooks/usePartnerRevenue'
import type { DateRange } from './types'
import { formatUTCDate, getUTCYesterday, subtractUTCDays } from './utils/dateUtils'

function getDefaultDateRange(): DateRange {
  // Default to 30 days ending yesterday UTC (to avoid fetching today's incomplete/slow data)
  const yesterday = getUTCYesterday()
  const start = subtractUTCDays(yesterday, 29) // 30 total days including yesterday
  return {
    startDate: formatUTCDate(start),
    endDate: formatUTCDate(yesterday),
  }
}

function App() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange)

  const affiliateRevenueQuery = useAffiliateRevenue(dateRange)
  const partnerRevenueQuery = usePartnerRevenue(dateRange)

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">ShapeShift Revenue Dashboard</h1>
        </header>

        <div className="mb-8">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {affiliateRevenueQuery.isError && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/50 border border-red-700 text-red-200">
            <p className="font-medium">Error loading revenue data</p>
            <p className="text-sm text-red-300">{affiliateRevenueQuery.error?.message || 'Unknown error'}</p>
          </div>
        )}

        {partnerRevenueQuery.isError && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/50 border border-red-700 text-red-200">
            <p className="font-medium">Error loading partner revenue</p>
            <p className="text-sm text-red-300">{partnerRevenueQuery.error?.message || 'Unknown error'}</p>
          </div>
        )}

        {affiliateRevenueQuery.data?.failedProviders && affiliateRevenueQuery.data.failedProviders.length > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-amber-900/50 border border-amber-700 text-amber-200">
            <p className="font-medium">Some providers failed to respond</p>
            <p className="text-sm text-amber-300">{affiliateRevenueQuery.data.failedProviders.join(', ')}</p>
          </div>
        )}

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TotalRevenue amount={affiliateRevenueQuery.data?.totalUsd} isLoading={affiliateRevenueQuery.isLoading} />
            <TotalVolume
              amount={affiliateRevenueQuery.data?.totalVolumeUsd}
              isLoading={affiliateRevenueQuery.isLoading}
            />
            <TotalFees count={affiliateRevenueQuery.data?.totalFeeCount} isLoading={affiliateRevenueQuery.isLoading} />
          </div>
          <ServiceStackedBarChart
            byDate={affiliateRevenueQuery.data?.byDate}
            isLoading={affiliateRevenueQuery.isLoading}
          />
          <ServiceBreakdown
            byService={affiliateRevenueQuery.data?.byService}
            byServiceVolume={affiliateRevenueQuery.data?.byServiceVolume}
            byServiceFeeCount={affiliateRevenueQuery.data?.byServiceFeeCount}
            totalUsd={affiliateRevenueQuery.data?.totalUsd}
            isLoading={affiliateRevenueQuery.isLoading}
            dateRange={dateRange}
          />
          <AssetBreakdown
            byAsset={affiliateRevenueQuery.data?.byAsset}
            totalUsd={affiliateRevenueQuery.data?.totalUsd}
            isLoading={affiliateRevenueQuery.isLoading}
            dateRange={dateRange}
          />
          <PartnerBreakdown
            data={partnerRevenueQuery.data}
            isLoading={partnerRevenueQuery.isLoading}
            isError={partnerRevenueQuery.isError}
          />
        </div>
      </div>
    </div>
  )
}

export default App
