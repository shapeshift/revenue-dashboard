import { useState, useMemo } from 'react'
import { subDays, startOfDay, endOfDay, format } from 'date-fns'
import type { DateRange } from '../types'

type PresetKey = '7d' | '30d' | '90d' | 'custom'

type DateRangePickerProps = {
  value: DateRange
  onChange: (range: DateRange) => void
}

const presets: { key: PresetKey; label: string; days: number }[] = [
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
  { key: '90d', label: '90 Days', days: 90 },
]

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [activePreset, setActivePreset] = useState<PresetKey>('30d')

  const startDate = useMemo(
    () => format(new Date(value.startTimestamp * 1000), 'yyyy-MM-dd'),
    [value.startTimestamp]
  )
  const endDate = useMemo(
    () => format(new Date(value.endTimestamp * 1000), 'yyyy-MM-dd'),
    [value.endTimestamp]
  )

  const handlePresetClick = (preset: (typeof presets)[number]) => {
    setActivePreset(preset.key)
    const now = new Date()
    const start = startOfDay(subDays(now, preset.days))
    const end = endOfDay(now)
    onChange({
      startTimestamp: Math.floor(start.getTime() / 1000),
      endTimestamp: Math.floor(end.getTime() / 1000),
    })
  }

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setActivePreset('custom')
    const date = new Date(e.target.value)
    onChange({
      ...value,
      startTimestamp: Math.floor(startOfDay(date).getTime() / 1000),
    })
  }

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setActivePreset('custom')
    const date = new Date(e.target.value)
    onChange({
      ...value,
      endTimestamp: Math.floor(endOfDay(date).getTime() / 1000),
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex gap-2">
        {presets.map((preset) => (
          <button
            key={preset.key}
            onClick={() => handlePresetClick(preset)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activePreset === preset.key
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-zinc-400">
        <input
          type="date"
          value={startDate}
          onChange={handleStartChange}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span>to</span>
        <input
          type="date"
          value={endDate}
          onChange={handleEndChange}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  )
}
