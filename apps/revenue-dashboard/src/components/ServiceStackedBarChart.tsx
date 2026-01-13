import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

import { SERVICE_COLORS, getServiceLabel, SERVICE_STACK_ORDER } from '../constants/services'
import type { DailyRevenue } from '../types'

interface ServiceStackedBarChartProps {
  byDate?: Record<string, DailyRevenue>
  isLoading: boolean
}

type TooltipPayload = {
  name: string
  value: number
  color: string
}

type CustomTooltipProps = {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length) return null

  const sortedPayload = [...payload].filter(item => item.value > 0).sort((a, b) => b.value - a.value)

  return (
    <div
      style={{
        backgroundColor: '#1f2937',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        padding: '12px',
        minWidth: '200px',
      }}
    >
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#f3f4f6',
          marginBottom: '8px',
          paddingBottom: '8px',
          borderBottom: '1px solid #374151',
        }}
      >
        {label &&
          new Date(label).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {sortedPayload.map(entry => (
          <div
            key={entry.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: entry.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '12px', color: '#d1d5db' }}>{getServiceLabel(entry.name)}</span>
            </div>
            <span style={{ fontSize: '12px', color: '#f3f4f6', fontWeight: 500, fontFamily: 'monospace' }}>
              ${entry.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ServiceStackedBarChart({ byDate, isLoading }: ServiceStackedBarChartProps) {
  const chartData = useMemo(() => {
    if (!byDate) return []
    return Object.entries(byDate)
      .map(([date, revenue]) => ({
        date,
        ...revenue.byService,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [byDate])

  if (isLoading) {
    return (
      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <div className="h-8 w-48 bg-zinc-700 rounded mb-6 animate-pulse" />
        <div className="h-96 bg-zinc-700/50 rounded animate-pulse" />
      </div>
    )
  }

  if (!byDate || chartData.length === 0) {
    return (
      <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <h2 className="text-xl font-semibold mb-6">Revenue by Service Over Time</h2>
        <div className="h-96 flex items-center justify-center text-zinc-500">No data available</div>
      </div>
    )
  }

  return (
    <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
      <h2 className="text-xl font-semibold mb-6">Revenue by Service Over Time</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
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
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#18181b', opacity: 0.3 }} />
          <Legend formatter={(value: string) => getServiceLabel(value)} wrapperStyle={{ paddingTop: '20px' }} />
          {SERVICE_STACK_ORDER.map(service => (
            <Bar
              key={service}
              dataKey={service}
              stackId="revenue"
              fill={SERVICE_COLORS[service]}
              activeBar={{ fill: SERVICE_COLORS[service], opacity: 0.9 }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
