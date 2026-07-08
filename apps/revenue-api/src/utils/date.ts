// Date <-> unix-seconds helpers. Fees.timestamp and all provider fetch windows are unix seconds;
// date strings are UTC `YYYY-MM-DD`.

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const timestampToDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000)
  return date.toISOString().split('T')[0]
}

export const getDateRange = (startTimestamp: number, endTimestamp: number): string[] => {
  const dates: string[] = []
  const start = new Date(startTimestamp * 1000)
  const end = new Date(endTimestamp * 1000)

  start.setUTCHours(0, 0, 0, 0)
  end.setUTCHours(0, 0, 0, 0)

  const current = new Date(start)
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

// Unix seconds at the start (00:00:00Z) of a `YYYY-MM-DD` day.
export const getDateStartTimestamp = (date: string): number => {
  return Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000)
}

// Unix seconds at the end (23:59:59Z) of a `YYYY-MM-DD` day.
export const getDateEndTimestamp = (date: string): number => {
  return Math.floor(new Date(date + 'T23:59:59Z').getTime() / 1000)
}

export type DateRange = { ok: true; startTimestamp: number; endTimestamp: number } | { ok: false; error: string }

// Validate YYYY-MM-DD start/end query params into UTC day-bounded unix timestamps.
export function parseDateRange(startDate?: string, endDate?: string): DateRange {
  if (!startDate || !DATE_REGEX.test(startDate)) {
    return { ok: false, error: 'Invalid startDate format, expected YYYY-MM-DD' }
  }
  if (!endDate || !DATE_REGEX.test(endDate)) {
    return { ok: false, error: 'Invalid endDate format, expected YYYY-MM-DD' }
  }

  const startTimestamp = getDateStartTimestamp(startDate)
  const endTimestamp = getDateEndTimestamp(endDate)

  if (isNaN(startTimestamp)) return { ok: false, error: 'Invalid startDate value' }
  if (isNaN(endTimestamp)) return { ok: false, error: 'Invalid endDate value' }

  if (startTimestamp > endTimestamp) return { ok: false, error: 'startDate must be on or before endDate' }

  return { ok: true, startTimestamp, endTimestamp }
}
