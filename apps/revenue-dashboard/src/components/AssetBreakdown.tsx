import { useEffect, useMemo, useRef, useState } from 'react'

import { getServiceColor, getServiceLabel } from '../constants/services'
import type { AssetRevenue, DateRange, Service } from '../types'
import { formatTokenAmountDisplay } from '../utils/assetHelpers'
import { formatUsd, formatPercent } from '../utils/formatters'

import { ExportButton } from './ExportButton'
import { SortHeader } from './SortHeader'
import { Tooltip } from './Tooltip'

type AssetBreakdownProps = {
  byAsset: Record<string, AssetRevenue> | undefined
  totalUsd: number | undefined
  isLoading: boolean
  dateRange: DateRange
}

type SortKey = 'symbol' | 'amountUsd' | 'volumeUsd' | 'feeCount'

const PAGE_SIZE = 10 // rows shown before scrolling; more are rendered as you scroll

type ProviderShare = {
  service: string
  amountUsd: number
  feeCount: number
  share: number
}

function ProvidersCell({ providers }: { providers: ProviderShare[] }) {
  const [top, ...rest] = providers
  if (!top) return <span>-</span>

  return (
    <Tooltip
      content={
        <table className="text-xs">
          <tbody>
            {providers.map(p => (
              <tr key={p.service}>
                <td className="pr-4 py-0.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: getServiceColor(p.service) }} />
                    {getServiceLabel(p.service)}
                  </span>
                </td>
                <td className="pr-4 text-right font-mono">{formatUsd(p.amountUsd)}</td>
                <td className="pr-4 text-right text-zinc-400">{formatPercent(p.share)}</td>
                <td className="text-right text-zinc-400">{p.feeCount.toLocaleString()} fees</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <span className="inline-flex flex-col items-end gap-1">
        <span>
          {getServiceLabel(top.service)}
          {rest.length > 0 && <span className="text-zinc-500"> +{rest.length}</span>}
        </span>
        <span className="flex w-24 h-1.5 rounded-full overflow-hidden bg-zinc-700">
          {providers.map(p => (
            <span key={p.service} style={{ width: `${p.share}%`, backgroundColor: getServiceColor(p.service) }} />
          ))}
        </span>
      </span>
    </Tooltip>
  )
}

export function AssetBreakdown({ byAsset, totalUsd, isLoading, dateRange }: AssetBreakdownProps) {
  const [sortKey, setSortKey] = useState<SortKey>('amountUsd')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(dir => (dir === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'symbol' ? 'asc' : 'desc') // names default A→Z, numbers high→low
    }
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const assetData = useMemo(() => {
    if (!byAsset || !totalUsd || totalUsd === 0) return []

    const dir = sortDir === 'asc' ? 1 : -1
    return Object.values(byAsset)
      .map(asset => ({
        ...asset,
        percentage: (asset.amountUsd / totalUsd) * 100,
        formattedAmount: formatTokenAmountDisplay(asset.tokenAmount),
        providers: (Object.entries(asset.byService) as [Service, number][])
          .filter(([, amountUsd]) => amountUsd > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([service, amountUsd]) => ({
            service,
            amountUsd,
            feeCount: asset.byServiceFeeCount[service] ?? 0,
            share: (amountUsd / asset.amountUsd) * 100,
          })),
      }))
      .filter(a => a.amountUsd > 5)
      .sort((a, b) => {
        if (sortKey === 'symbol') return a.symbol.localeCompare(b.symbol) * dir
        return (a[sortKey] - b[sortKey]) * dir
      })
  }, [byAsset, totalUsd, sortKey, sortDir])

  // Reset paging only when the underlying data changes (new date range), not on re-sort.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  useEffect(() => setVisibleCount(PAGE_SIZE), [byAsset])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
      setVisibleCount(count => Math.min(count + PAGE_SIZE, assetData.length))
    }
  }

  const exportData = useMemo(() => {
    if (!assetData.length) return { headers: [], rows: [] }

    const headers = ['Asset', 'Amount', 'USD Value', 'Volume', 'Fees', 'Share', 'Providers']
    const rows = assetData.map(asset => [
      `${asset.symbol} (${asset.chainName})`,
      asset.formattedAmount,
      formatUsd(asset.amountUsd),
      formatUsd(asset.volumeUsd),
      asset.feeCount.toLocaleString(),
      formatPercent(asset.percentage),
      asset.providers.map(p => `${getServiceLabel(p.service)} ${formatPercent(p.share)}`).join('; ') || '-',
    ])

    return { headers, rows }
  }, [assetData])

  const filename = `asset-breakdown-${dateRange.startDate}_to_${dateRange.endDate}.csv`

  if (isLoading) {
    return (
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
        <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-4">Revenue by Asset</h2>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-zinc-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (assetData.length === 0) {
    return (
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
        <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-4">Revenue by Asset</h2>
        <p className="text-zinc-500">No asset data available</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Revenue by Asset</h2>
        <ExportButton headers={exportData.headers} rows={exportData.rows} filename={filename} />
      </div>
      <div
        ref={scrollRef}
        className="overflow-auto scrollbar-thin"
        style={{ maxHeight: '30rem' }}
        onScroll={handleScroll}
      >
        <table className="w-full text-sm [&_th:first-child]:pl-2 [&_td:first-child]:pl-2 [&_th:last-child]:pr-2 [&_td:last-child]:pr-2">
          <thead>
            <tr className="text-zinc-400 border-b border-zinc-700">
              <SortHeader
                label="Asset"
                colKey="symbol"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="left"
              />
              <th className="text-right py-2 font-medium sticky top-0 bg-zinc-800">Amount</th>
              <SortHeader
                label="USD Value"
                colKey="amountUsd"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader label="Volume" colKey="volumeUsd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Fees" colKey="feeCount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="text-right py-2 font-medium sticky top-0 bg-zinc-800">Share</th>
              <th className="text-right py-2 font-medium sticky top-0 bg-zinc-800">Providers</th>
            </tr>
          </thead>
          <tbody>
            {assetData.slice(0, visibleCount).map(asset => (
              <tr key={asset.assetId} className="border-b border-zinc-800">
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-200 font-medium">{asset.symbol}</span>
                    <span className="text-zinc-500 text-xs px-1.5 py-0.5 rounded bg-zinc-700/50">
                      {asset.chainName}
                    </span>
                  </div>
                </td>
                <td className="text-right py-3 text-zinc-200 font-mono">{asset.formattedAmount}</td>
                <td className="text-right py-3 text-zinc-200 font-mono">{formatUsd(asset.amountUsd)}</td>
                <td className="text-right py-3 text-zinc-200 font-mono">{formatUsd(asset.volumeUsd)}</td>
                <td className="text-right py-3 text-zinc-400">{asset.feeCount.toLocaleString()}</td>
                <td className="text-right py-3 text-zinc-400">{formatPercent(asset.percentage)}</td>
                <td className="text-right py-3 text-zinc-400">
                  <ProvidersCell providers={asset.providers} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
