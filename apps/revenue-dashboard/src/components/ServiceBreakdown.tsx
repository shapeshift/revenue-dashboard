import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

import type { ServiceRevenue } from '../types'

type ServiceBreakdownProps = {
  byService: Record<string, number> | undefined
  totalUsd: number | undefined
  isLoading: boolean
}

const SERVICE_COLORS: Record<string, string> = {
  thorchain: '#0095FF',
  mayachain: '#6366f1',
  chainflip: '#22c55e',
  zrx: '#f59e0b',
  bebop: '#ec4899',
  portals: '#14b8a6',
  cowswap: '#8b5cf6',
  relay: '#f97316',
  butterswap: '#84cc16',
  nearintents: '#06b6d4',
}

const getServiceColor = (service: string) => SERVICE_COLORS[service.toLowerCase()] || '#6b7280'

const SERVICE_LABELS: Record<string, string> = {
  nearintents: 'Near Intents',
  butterswap: 'Butter Swap',
  thorchain: 'THORChain',
  mayachain: 'Maya Protocol',
  chainflip: 'Chainflip',
  zrx: '0x',
  bebop: 'Bebop',
  portals: 'Portals',
  cowswap: 'CoW Swap',
  relay: 'Relay',
}

const getServiceLabel = (service: string) =>
  SERVICE_LABELS[service.toLowerCase()] || service

const formatUsd = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

const formatPercent = (value: number) => `${value.toFixed(1)}%`

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null

  const data = payload[0]
  const serviceName = data.name
  const serviceLabel = getServiceLabel(serviceName)
  const value = formatUsd(Number(data.value))

  return (
    <div
      style={{
        backgroundColor: '#27272a',
        border: '1px solid #3f3f46',
        borderRadius: '8px',
        padding: '8px 12px',
      }}
    >
      <p style={{ color: '#fff', margin: 0 }}>
        {serviceLabel}: {value}
      </p>
    </div>
  )
}

export function ServiceBreakdown({ byService, totalUsd, isLoading }: ServiceBreakdownProps) {
  const serviceData: ServiceRevenue[] = useMemo(() => {
    if (!byService || !totalUsd || totalUsd === 0) return []

    return Object.entries(byService)
      .map(([service, amount]) => ({
        service,
        amount,
        percentage: (amount / totalUsd) * 100,
      }))
      .filter(s => s.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [byService, totalUsd])

  if (isLoading) {
    return (
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
        <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-4">Revenue by Service</h2>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-zinc-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (serviceData.length === 0) {
    return (
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
        <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-4">Revenue by Service</h2>
        <p className="text-zinc-500">No revenue data available</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-6">
      <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-4">Revenue by Service</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={serviceData}
                dataKey="amount"
                nameKey="service"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={60}
                paddingAngle={2}
                label={({ name }) => getServiceLabel(name)}
                labelLine={false}
              >
                {serviceData.map(entry => (
                  <Cell key={entry.service} fill={getServiceColor(entry.service)} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={getServiceLabel} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-700">
                <th className="text-left py-2 font-medium">Service</th>
                <th className="text-right py-2 font-medium">Revenue</th>
                <th className="text-right py-2 font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {serviceData.map(service => (
                <tr key={service.service} className="border-b border-zinc-800">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getServiceColor(service.service) }}
                      />
                      <span className="text-zinc-200">{getServiceLabel(service.service)}</span>
                    </div>
                  </td>
                  <td className="text-right py-3 text-zinc-200 font-mono">{formatUsd(service.amount)}</td>
                  <td className="text-right py-3 text-zinc-400">{formatPercent(service.percentage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
