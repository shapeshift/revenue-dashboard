const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export type DateRange = { ok: true; startTimestamp: number; endTimestamp: number } | { ok: false; error: string }

// Validate YYYY-MM-DD start/end query params into UTC day-bounded unix timestamps.
export function parseDateRange(startDate?: string, endDate?: string): DateRange {
  if (!startDate || !DATE_REGEX.test(startDate)) {
    return { ok: false, error: 'Invalid startDate format, expected YYYY-MM-DD' }
  }
  if (!endDate || !DATE_REGEX.test(endDate)) {
    return { ok: false, error: 'Invalid endDate format, expected YYYY-MM-DD' }
  }

  const startTimestamp = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000)
  const endTimestamp = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000)

  if (isNaN(startTimestamp)) return { ok: false, error: 'Invalid startDate value' }
  if (isNaN(endTimestamp)) return { ok: false, error: 'Invalid endDate value' }

  return { ok: true, startTimestamp, endTimestamp }
}
