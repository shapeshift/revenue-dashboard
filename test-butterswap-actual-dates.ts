#!/usr/bin/env bun

/**
 * Test the actual date range from the dashboard: 24/12/2025 to 22/01/2026
 */

const API_URL = 'http://localhost:4200/api/affiliate-revenue'

// The actual date range from the dashboard
const startDate = new Date('2025-12-24T00:00:00Z')
const endDate = new Date('2026-01-22T00:00:00Z')

const startTimestamp = Math.floor(startDate.getTime() / 1000)
const endTimestamp = Math.floor(endDate.getTime() / 1000)

console.log('Testing ButterSwap with actual dashboard date range:')
console.log(`Start: ${startDate.toISOString()} (${startTimestamp})`)
console.log(`End: ${endDate.toISOString()} (${endTimestamp})`)

// Analyze what getDateRange returns
const getDateRange = (start: number, end: number): string[] => {
  const dates: string[] = []
  const startDate = new Date(start * 1000)
  const endDate = new Date(end * 1000)

  startDate.setUTCHours(0, 0, 0, 0)
  endDate.setUTCHours(0, 0, 0, 0)

  const current = new Date(startDate)
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0])
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

const dates = getDateRange(startTimestamp, endTimestamp)
console.log(`\ngetDateRange returns ${dates.length} dates`)
console.log(`First date: ${dates[0]}`)
console.log(`Last date: ${dates[dates.length - 1]}`)

// Check if timestamps are at midnight
const isStartMidnight = startDate.getUTCHours() === 0 && startDate.getUTCMinutes() === 0 && startDate.getUTCSeconds() === 0
const isEndMidnight = endDate.getUTCHours() === 0 && endDate.getUTCMinutes() === 0 && endDate.getUTCSeconds() === 0

console.log(`\nStart is at midnight: ${isStartMidnight}`)
console.log(`End is at midnight: ${isEndMidnight}`)

const daysBetween = (endTimestamp - startTimestamp) / (24 * 60 * 60)
console.log(`\nActual days between timestamps: ${daysBetween}`)
console.log(`Dates from getDateRange: ${dates.length}`)
console.log(`Difference: ${dates.length - daysBetween} ${dates.length > daysBetween ? '(getDateRange returns MORE)' : ''}`)

console.log('\n' + '='.repeat(80))
console.log('KEY INSIGHT')
console.log('='.repeat(80))
if (dates.length > daysBetween && isStartMidnight && isEndMidnight) {
  console.log(`
⚠️  FOUND THE ISSUE!

getDateRange is inclusive on both ends:
- Start: ${dates[0]} (included)
- End: ${dates[dates.length - 1]} (included)

For midnight-to-midnight queries, this means:
- OLD logic: Queries ${daysBetween} days of actual fees
- Then divides by ${dates.length} dates
- Result: Under-reports because ${daysBetween} days ÷ ${dates.length} dates < 1

- NEW logic: Queries each of ${dates.length} dates individually
- Last date (${dates[dates.length - 1]}) from 00:00 to 00:00 = 0 fees
- But earlier dates capture all actual fees
- Result: Reports actual cumulative growth

The $30 difference is likely:
- OLD: Lost to BigInt division truncation (${daysBetween} ÷ ${dates.length} loses remainder)
- NEW: Captures exact blockchain state changes
`)
}

try {
  console.log('\n' + '='.repeat(80))
  console.log('QUERYING API')
  console.log('='.repeat(80))

  const response = await fetch(`${API_URL}?start=${startTimestamp}&end=${endTimestamp}`)
  const data = await response.json()

  const butterswapFees = data.fees.filter((f: any) => f.service === 'butterswap')

  console.log(`\nFound ${butterswapFees.length} ButterSwap fee entries`)

  if (butterswapFees.length === 0) {
    console.log('\n⚠️  No ButterSwap fees found! The integration might not have data for this period.')
  } else {
    let total = 0
    console.log('\nFees by date:')
    butterswapFees.forEach((fee: any) => {
      const amountUsd = parseFloat(fee.amountUsd)
      total += amountUsd
      const date = new Date(fee.timestamp * 1000).toISOString().split('T')[0]
      const time = new Date(fee.timestamp * 1000).toISOString()
      console.log(`  ${date} (${time}): $${amountUsd.toFixed(6)} (${fee.amount} base units)`)
    })

    console.log(`\nTotal ButterSwap revenue: $${total.toFixed(2)}`)

    console.log('\n' + '='.repeat(80))
    console.log('ANALYSIS')
    console.log('='.repeat(80))

    // Check if last date has fees
    const lastDateInRange = dates[dates.length - 1]
    const hasLastDayFees = butterswapFees.some((f: any) => {
      const feeDate = new Date(f.timestamp * 1000).toISOString().split('T')[0]
      return feeDate === lastDateInRange
    })

    console.log(`Last date in range: ${lastDateInRange}`)
    console.log(`Has fees on last date: ${hasLastDayFees}`)

    if (hasLastDayFees && isEndMidnight) {
      console.log('\n⚠️  WARNING: Last date has fees but endTimestamp is midnight!')
      console.log('This suggests the NEW logic is querying a full day for the last date.')
      console.log('This could be the source of extra $30.')
    } else if (!hasLastDayFees && isEndMidnight) {
      console.log('\n✓ Last date has no fees (expected for midnight end timestamp)')
    }

    // Check for BigInt truncation
    const totalBaseUnits = butterswapFees.reduce((sum: bigint, f: any) => sum + BigInt(f.amount), BigInt(0))
    const avgPerDay = totalBaseUnits / BigInt(dates.length)
    const truncatedTotal = avgPerDay * BigInt(dates.length)
    const lostToTruncation = totalBaseUnits - truncatedTotal

    console.log(`\nBigInt division analysis:`)
    console.log(`  Total: ${totalBaseUnits} base units`)
    console.log(`  Avg per day: ${avgPerDay} base units`)
    console.log(`  Truncated total: ${truncatedTotal} base units`)
    console.log(`  Lost to truncation: ${lostToTruncation} base units ($${Number(lostToTruncation) / 1000000} USDT)`)

    if (Math.abs(Number(lostToTruncation) / 1000000) >= 30) {
      console.log('\n✓ FOUND IT! BigInt truncation loses ~$30')
    }
  }

} catch (error) {
  console.error('\nError querying API:', error)
  console.log('\nMake sure:')
  console.log('1. API server is running: bun dev')
  console.log('2. Server is on port 4200')
}
