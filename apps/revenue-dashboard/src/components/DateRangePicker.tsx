import { subDays, format } from 'date-fns'
import { useState } from 'react'

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
  const [pendingRange, setPendingRange] = useState<DateRange | null>(null)

  const handlePresetClick = (preset: (typeof presets)[number]) => {
    setActivePreset(preset.key)
    setPendingRange(null)
    // End at yesterday to avoid fetching today's incomplete/slow data
    const yesterday = subDays(new Date(), 1)
    const start = subDays(yesterday, preset.days - 1)
    onChange({
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(yesterday, 'yyyy-MM-dd'),
    })
  }

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setActivePreset('custom')
    const newRange = {
      startDate: e.target.value,
      endDate: pendingRange?.endDate ?? value.endDate,
    }
    setPendingRange(newRange)
  }

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setActivePreset('custom')
    const newRange = {
      startDate: pendingRange?.startDate ?? value.startDate,
      endDate: e.target.value,
    }
    setPendingRange(newRange)
  }

  const handleRunReport = () => {
    if (pendingRange) {
      onChange(pendingRange)
      setPendingRange(null)
    }
  }

  const displayedStartDate = pendingRange?.startDate ?? value.startDate
  const displayedEndDate = pendingRange?.endDate ?? value.endDate
  const hasPendingChanges = pendingRange !== null

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex gap-2">
        {presets.map(preset => (
          <button
            key={preset.key}
            onClick={() => handlePresetClick(preset)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activePreset === preset.key ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-zinc-400">
        <input
          type="date"
          value={displayedStartDate}
          onChange={handleStartChange}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span>to</span>
        <input
          type="date"
          value={displayedEndDate}
          onChange={handleEndChange}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleRunReport}
          disabled={!hasPendingChanges}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            hasPendingChanges
              ? 'bg-green-600 text-white hover:bg-green-500'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          Run Report
        </button>
      </div>
    </div>
  )
}
