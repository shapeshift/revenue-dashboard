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
  const [tab, setTab] = useState<'revenue' | 'partners'>('revenue')

  const { data, isLoading, isError, error } = useAffiliateRevenue(dateRange)
  const { data: partnerData, isLoading: partnerLoading } = usePartnerRevenue(dateRange)

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">ShapeShift Revenue Dashboard</h1>
          <p className="text-zinc-400">Affiliate revenue from swap providers (net of partner payouts)</p>
        </header>

        <div className="mb-6 flex gap-2">
          <button
            className={`rounded px-3 py-1 ${tab === 'revenue' ? 'bg-zinc-700' : 'bg-zinc-800'}`}
            onClick={() => setTab('revenue')}
          >
            Revenue
          </button>
          <button
            className={`rounded px-3 py-1 ${tab === 'partners' ? 'bg-zinc-700' : 'bg-zinc-800'}`}
            onClick={() => setTab('partners')}
          >
            Partners
          </button>
        </div>

        <div className="mb-8">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {tab === 'revenue' ? (
          <>
            {isError && (
              <div className="mb-6 p-4 rounded-lg bg-red-900/50 border border-red-700 text-red-200">
                <p className="font-medium">Error loading revenue data</p>
                <p className="text-sm text-red-300">{error?.message || 'Unknown error'}</p>
              </div>
            )}

            {data?.failedProviders && data.failedProviders.length > 0 && (
              <div className="mb-6 p-4 rounded-lg bg-amber-900/50 border border-amber-700 text-amber-200">
                <p className="font-medium">Some providers failed to respond</p>
                <p className="text-sm text-amber-300">{data.failedProviders.join(', ')}</p>
              </div>
            )}

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TotalRevenue amount={data?.totalUsd} isLoading={isLoading} />
                <TotalVolume amount={data?.totalVolumeUsd} isLoading={isLoading} />
                <TotalFees count={data?.totalFeeCount} isLoading={isLoading} />
              </div>
              <ServiceStackedBarChart byDate={data?.byDate} isLoading={isLoading} />
              <ServiceBreakdown
                byService={data?.byService}
                byServiceVolume={data?.byServiceVolume}
                byServiceFeeCount={data?.byServiceFeeCount}
                totalUsd={data?.totalUsd}
                isLoading={isLoading}
                dateRange={dateRange}
              />
              <AssetBreakdown
                byAsset={data?.byAsset}
                totalUsd={data?.totalUsd}
                isLoading={isLoading}
                dateRange={dateRange}
              />
            </div>
          </>
        ) : (
          <PartnerBreakdown data={partnerData} isLoading={partnerLoading} />
        )}
      </div>
    </div>
  )
}

export default App
