export const formatUTCDate = (date: Date): string => {
  return date.toISOString().slice(0, 10)
}

// The current UTC day always contains now, so a range ending here misses nothing in any local timezone
export const getUTCToday = (): Date => {
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  return now
}

export const subtractUTCDays = (date: Date, days: number): Date => {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() - days)
  return result
}
