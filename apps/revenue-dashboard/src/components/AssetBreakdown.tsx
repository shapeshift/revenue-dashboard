import { useMemo } from 'react'

import { getServiceLabel } from '../constants/services'
import type { AssetRevenue } from '../types'
import { formatTokenAmountDisplay } from '../utils/assetHelpers'
import { formatUsd, formatPercent } from '../utils/formatters'

type AssetBreakdownProps = {
  byAsset: Record<string, AssetRevenue> | undefined
  totalUsd: number | undefined
  isLoading: boolean
}

export function AssetBreakdown({ byAsset, totalUsd, isLoading }: AssetBreakdownProps) {
  const assetData = useMemo(() => {
    if (!byAsset || !totalUsd || totalUsd === 0) return []

    return Object.values(byAsset)
      .map(asset => ({
        ...asset,
        percentage: (asset.amountUsd / totalUsd) * 100,
        formattedAmount: formatTokenAmountDisplay(asset.tokenAmount),
        topProvider: Object.entries(asset.byService).sort((a, b) => b[1] - a[1])[0],
      }))
      .filter(a => a.amountUsd > 5)
      .sort((a, b) => b.amountUsd - a.amountUsd)
  }, [byAsset, totalUsd])

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
      <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-4">Revenue by Asset</h2>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-400 border-b border-zinc-700">
              <th className="text-left py-2 font-medium">Asset</th>
              <th className="text-right py-2 font-medium">Amount</th>
              <th className="text-right py-2 font-medium">USD Value</th>
              <th className="text-right py-2 font-medium">Volume</th>
              <th className="text-right py-2 font-medium">Fees</th>
              <th className="text-right py-2 font-medium">Share</th>
              <th className="text-right py-2 font-medium">Top Provider</th>
            </tr>
          </thead>
          <tbody>
            {assetData.map(asset => (
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
                  {asset.topProvider ? getServiceLabel(asset.topProvider[0]) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
