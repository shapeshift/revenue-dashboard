export const formatUTCDate = (date: Date): string => {
  return date.toISOString().slice(0, 10)
}

export const getUTCYesterday = (): Date => {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - 1)
  now.setUTCHours(0, 0, 0, 0)
  return now
}

export const subtractUTCDays = (date: Date, days: number): Date => {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() - days)
  return result
}
