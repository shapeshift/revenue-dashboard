import { useEffect, useMemo, useRef, useState } from 'react'

import type { PartnerRevenueResponse } from '../types'
import { formatUsd } from '../utils/formatters'

import { SortArrow } from './SortArrow'

type SortKey = 'partnerCode' | 'totalUsd' | 'totalVolumeUsd' | 'swapCount'

type PartnerBreakdownProps = {
  data: PartnerRevenueResponse | undefined
  isLoading: boolean
}

const SORT_LABELS: Record<SortKey, string> = {
  partnerCode: 'Partner',
  totalUsd: 'Revenue',
  totalVolumeUsd: 'Volume',
  swapCount: 'Swaps',
}

// Right-aligned numeric columns (Partner is handled separately, left-aligned).
const SORT_KEYS: SortKey[] = ['totalUsd', 'totalVolumeUsd', 'swapCount']

const PAGE_SIZE = 10 // rows shown before scrolling; more are rendered as you scroll

export function PartnerBreakdown({ data, isLoading }: PartnerBreakdownProps) {
  const [sortKey, setSortKey] = useState<SortKey>('totalUsd')
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

  if (!data || rows.length === 0) {
    return (
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
        <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-4">Revenue by Partner</h2>
        <p className="text-zinc-500">No partner revenue in this range</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
      <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-4">Revenue by Partner</h2>
      <div
        ref={scrollRef}
        className="overflow-auto scrollbar-thin"
        style={{ maxHeight: '30rem' }}
        onScroll={handleScroll}
      >
        <table className="w-full text-sm [&_th:first-child]:pl-2 [&_td:first-child]:pl-2 [&_th:last-child]:pr-2 [&_td:last-child]:pr-2">
          <thead>
            <tr className="text-zinc-400 border-b border-zinc-700">
              <th
                className="text-left py-2 font-medium cursor-pointer select-none hover:text-zinc-200 sticky top-0 bg-zinc-800"
                onClick={() => handleSort('partnerCode')}
              >
                {SORT_LABELS.partnerCode}
                <SortArrow active={sortKey === 'partnerCode'} dir={sortDir} />
              </th>
              {SORT_KEYS.map(key => (
                <th
                  key={key}
                  className="text-right py-2 font-medium cursor-pointer select-none hover:text-zinc-200 sticky top-0 bg-zinc-800"
                  onClick={() => handleSort(key)}
                >
                  {SORT_LABELS[key]}
                  <SortArrow active={sortKey === key} dir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, visibleCount).map(partner => (
              <tr key={partner.partnerCode} className="border-b border-zinc-800">
                <td className="py-3 text-zinc-200 font-medium">{partner.partnerCode}</td>
                <td className="text-right py-3 text-zinc-200 font-mono">{formatUsd(partner.totalUsd)}</td>
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
