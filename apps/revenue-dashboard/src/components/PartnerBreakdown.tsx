import { useEffect, useMemo, useRef, useState } from 'react'

import type { PartnerRevenueResponse } from '../types'
import { formatPercent, formatUsd } from '../utils/formatters'

import { SortHeader } from './SortHeader'

type SortKey = 'partnerCode' | 'shapeshiftUsd' | 'totalUsd' | 'totalVolumeUsd' | 'swapCount'

type PartnerBreakdownProps = {
  data: PartnerRevenueResponse | undefined
  totalRevenueUsd: number | undefined // net revenue across all swaps, for the share-of-total figure
  isLoading: boolean
  isError?: boolean
}

const SORT_LABELS: Record<SortKey, string> = {
  partnerCode: 'Partner',
  shapeshiftUsd: 'Revenue',
  totalUsd: 'Payout',
  totalVolumeUsd: 'Volume',
  swapCount: 'Swaps',
}

// Right-aligned numeric columns (Partner is handled separately, left-aligned).
const SORT_KEYS: SortKey[] = ['shapeshiftUsd', 'totalUsd', 'totalVolumeUsd', 'swapCount']

// tiny partner swaps would otherwise render as $0.00 and read as unpaid
const formatCell = (amount: number) => (amount > 0 && amount < 0.01 ? '<$0.01' : formatUsd(amount))

const PAGE_SIZE = 10 // rows shown before scrolling; more are rendered as you scroll

export function PartnerBreakdown({ data, totalRevenueUsd, isLoading, isError }: PartnerBreakdownProps) {
  const [sortKey, setSortKey] = useState<SortKey>('shapeshiftUsd')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(dir => (dir === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'partnerCode' ? 'asc' : 'desc') // names default A→Z, numbers high→low
    }
    // Data is already loaded — re-sort in place, keep expanded rows, just jump to the new top.
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const rows = useMemo(() => {
    if (!data) return []
    const dir = sortDir === 'asc' ? 1 : -1
    return Object.values(data.byPartner).sort((a, b) => {
      if (sortKey === 'partnerCode') return a.partnerCode.localeCompare(b.partnerCode) * dir
      return (a[sortKey] - b[sortKey]) * dir
    })
  }, [data, sortKey, sortDir])

  // Reset paging only when the underlying data changes (new date range), not on re-sort.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  useEffect(() => setVisibleCount(PAGE_SIZE), [data])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
      setVisibleCount(count => Math.min(count + PAGE_SIZE, rows.length))
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
        <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-4">Revenue by Partner</h2>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-zinc-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) return null

  if (!data || rows.length === 0) {
    return (
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
        <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-4">Revenue by Partner</h2>
        <p className="text-zinc-500">No partner revenue in this range</p>
      </div>
    )
  }

  const shareOfTotal = totalRevenueUsd ? (data.shapeshiftTotalUsd / totalRevenueUsd) * 100 : undefined

  return (
    <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
        <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Revenue by Partner</h2>
        {shareOfTotal !== undefined && (
          <span className="text-zinc-400 text-sm">{formatPercent(shareOfTotal)} of total revenue</span>
        )}
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
                label={SORT_LABELS.partnerCode}
                colKey="partnerCode"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="left"
              />
              {SORT_KEYS.map(key => (
                <SortHeader
                  key={key}
                  label={SORT_LABELS[key]}
                  colKey={key}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, visibleCount).map(partner => (
              <tr key={partner.partnerCode} className="border-b border-zinc-800">
                <td className="py-3 text-zinc-200 font-medium">{partner.partnerCode}</td>
                <td className="text-right py-3 text-zinc-200 font-mono">{formatCell(partner.shapeshiftUsd)}</td>
                <td className="text-right py-3 text-zinc-200 font-mono">{formatCell(partner.totalUsd)}</td>
                <td className="text-right py-3 text-zinc-200 font-mono">{formatUsd(partner.totalVolumeUsd)}</td>
                <td className="text-right py-3 text-zinc-400">{partner.swapCount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
