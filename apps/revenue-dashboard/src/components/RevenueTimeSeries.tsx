import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

import type { DailyRevenue } from '../types'

interface RevenueTimeSeriesProps {
  byDate?: Record<string, DailyRevenue>
  isLoading: boolean
}

export function RevenueTimeSeries({ byDate, isLoading }: RevenueTimeSeriesProps) {
  const chartData = useMemo(() => {
    if (!byDate) return []

    return Object.entries(byDate)
      .map(([date, revenue]) => ({
        date,
        totalUsd: revenue.totalUsd,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [byDate])

  if (isLoading) {
    return (
      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <div className="h-8 w-48 bg-zinc-700 rounded mb-6 animate-pulse" />
        <div className="h-64 bg-zinc-700/50 rounded animate-pulse" />
      </div>
    )
  }

  if (!byDate || chartData.length === 0) {
    return (
      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h2 className="text-xl font-semibold mb-6">Daily Revenue</h2>
        <div className="h-64 flex items-center justify-center text-zinc-500">No data available</div>
      </div>
    )
  }

  return (
    <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
      <h2 className="text-xl font-semibold mb-6">Daily Revenue</h2>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorUsd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            stroke="#9ca3af"
            tick={{ fill: '#9ca3af' }}
            tickFormatter={(value: string) => {
              const date = new Date(value)
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }}
          />
          <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af' }} tickFormatter={value => `$${value.toLocaleString()}`} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '0.5rem',
              color: '#f3f4f6',
            }}
            formatter={(value: number | undefined) => [
              `$${(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              'Revenue',
            ]}
            labelFormatter={(label: string) => {
              const date = new Date(label)
              return date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            }}
          />
          <Area
            type="monotone"
            dataKey="totalUsd"
            stroke="#3b82f6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorUsd)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
