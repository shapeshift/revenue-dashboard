import { useMemo, useState } from 'react'

import type { PartnerRevenueResponse } from '../types'
import { formatUsd } from '../utils/formatters'

type SortKey = 'totalUsd' | 'totalVolumeUsd' | 'swapCount'

type PartnerBreakdownProps = {
  data: PartnerRevenueResponse | undefined
  isLoading: boolean
}

const SORT_LABELS: Record<SortKey, string> = {
  totalUsd: 'Revenue',
  totalVolumeUsd: 'Volume',
  swapCount: 'Swaps',
}

const SORT_KEYS: SortKey[] = ['totalUsd', 'totalVolumeUsd', 'swapCount']

export function PartnerBreakdown({ data, isLoading }: PartnerBreakdownProps) {
  const [sortKey, setSortKey] = useState<SortKey>('totalUsd')

  const rows = useMemo(() => {
    if (!data) return []
    return Object.values(data.byPartner).sort((a, b) => b[sortKey] - a[sortKey])
  }, [data, sortKey])

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Revenue by Partner</h2>
        <div className="text-sm text-zinc-400">
          Partner payouts: <span className="text-zinc-200 font-mono">{formatUsd(data.partnerTotalUsd)}</span>
          {data.unreconciled.count > 0 && (
            <span className="ml-2 text-amber-400">
              ({data.unreconciled.count} unreconciled, {formatUsd(data.unreconciled.usd)})
            </span>
          )}
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-400 border-b border-zinc-700">
              <th className="text-left py-2 font-medium">Partner</th>
              {SORT_KEYS.map(key => (
                <th
                  key={key}
                  className="text-right py-2 font-medium cursor-pointer select-none hover:text-zinc-200"
                  onClick={() => setSortKey(key)}
                >
                  {SORT_LABELS[key]}
                  {sortKey === key ? ' ▾' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(partner => (
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
