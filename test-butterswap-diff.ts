#!/usr/bin/env bun

/**
 * Test script to analyze the difference between old and new ButterSwap logic
 *
 * This script simulates both approaches to understand where the $30 difference comes from.
 */

// Simulate the cache functions
const getDateRange = (startTimestamp: number, endTimestamp: number): string[] => {
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

const getDateStartTimestamp = (date: string): number => {
  return Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000)
}

const getDateEndTimestamp = (date: string): number => {
  return Math.floor(new Date(date + 'T23:59:59Z').getTime() / 1000)
}

// Simulate OLD logic
function simulateOldLogic(
  startTimestamp: number,
  endTimestamp: number,
  balanceAtStart: bigint,
  balanceAtEnd: bigint
): { fees: Array<{ date: string, amount: bigint }>, total: bigint } {
  const feesForPeriod = balanceAtEnd - balanceAtStart

  if (feesForPeriod <= BigInt(0)) {
    return { fees: [], total: BigInt(0) }
  }

  const dates = getDateRange(startTimestamp, endTimestamp)
  const numDays = dates.length
  const feesPerDay = feesForPeriod / BigInt(numDays) // BigInt division truncates!

  const fees = dates.map(date => ({
    date,
    amount: feesPerDay,
  }))

  const total = feesPerDay * BigInt(numDays)

  console.log('\n=== OLD LOGIC ===')
  console.log(`Period: ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`)
  console.log(`Balance at start: ${balanceAtStart}`)
  console.log(`Balance at end: ${balanceAtEnd}`)
  console.log(`Total fees for period: ${feesForPeriod}`)
  console.log(`Number of days: ${numDays}`)
  console.log(`Fees per day (truncated): ${feesPerDay}`)
  console.log(`Lost to rounding: ${feesForPeriod - total}`)
  console.log('Fees per date:')
  fees.forEach(f => console.log(`  ${f.date}: ${f.amount}`))
  console.log(`Total reported: ${total}`)

  return { fees, total }
}

// Simulate NEW logic with daily queries
function simulateNewLogic(
  startTimestamp: number,
  endTimestamp: number,
  dailyBalances: Map<number, bigint> // timestamp -> balance
): { fees: Array<{ date: string, amount: bigint }>, total: bigint } {
  const dates = getDateRange(startTimestamp, endTimestamp)
  const fees: Array<{ date: string, amount: bigint }> = []
  let total = BigInt(0)

  console.log('\n=== NEW LOGIC ===')
  console.log(`Period: ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`)
  console.log('Fees per date:')

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]
    const isFirstDay = i === 0
    const isLastDay = i === dates.length - 1

    const dayStart = isFirstDay ? startTimestamp : getDateStartTimestamp(date)
    const dayEnd = isLastDay ? endTimestamp : getDateEndTimestamp(date)

    const balanceAtDayStart = dailyBalances.get(dayStart) ?? BigInt(0)
    const balanceAtDayEnd = dailyBalances.get(dayEnd) ?? BigInt(0)

    const feesForDay = balanceAtDayEnd - balanceAtDayStart

    if (feesForDay > BigInt(0)) {
      fees.push({ date, amount: feesForDay })
      total += feesForDay
      console.log(`  ${date}: ${feesForDay} (${new Date(dayStart * 1000).toISOString()} to ${new Date(dayEnd * 1000).toISOString()})`)
      console.log(`    Balance[${dayStart}] = ${balanceAtDayStart}`)
      console.log(`    Balance[${dayEnd}] = ${balanceAtDayEnd}`)
    } else {
      console.log(`  ${date}: 0 (skipped)`)
    }
  }

  console.log(`Total reported: ${total}`)

  return { fees, total }
}

// Test Case 1: Even distribution (no rounding issues)
console.log('\n' + '='.repeat(80))
console.log('TEST CASE 1: Even distribution')
console.log('='.repeat(80))

const start1 = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000)
const end1 = Math.floor(new Date('2024-01-05T00:00:00Z').getTime() / 1000)

const balanceStart1 = BigInt(1000000) // 1 USDT (6 decimals)
const balanceEnd1 = BigInt(6000000) // 6 USDT

const old1 = simulateOldLogic(start1, end1, balanceStart1, balanceEnd1)

// Simulate daily balances growing evenly (cumulative balance like on blockchain)
const dailyBalances1 = new Map<number, bigint>()
dailyBalances1.set(start1, balanceStart1) // Jan 1 00:00 = 1 USDT
dailyBalances1.set(getDateEndTimestamp('2024-01-01'), BigInt(2000000)) // Jan 1 23:59 = 2 USDT
dailyBalances1.set(getDateStartTimestamp('2024-01-02'), BigInt(2000000)) // Jan 2 00:00 = 2 USDT
dailyBalances1.set(getDateEndTimestamp('2024-01-02'), BigInt(3000000)) // Jan 2 23:59 = 3 USDT
dailyBalances1.set(getDateStartTimestamp('2024-01-03'), BigInt(3000000)) // Jan 3 00:00 = 3 USDT
dailyBalances1.set(getDateEndTimestamp('2024-01-03'), BigInt(4000000)) // Jan 3 23:59 = 4 USDT
dailyBalances1.set(getDateStartTimestamp('2024-01-04'), BigInt(4000000)) // Jan 4 00:00 = 4 USDT
dailyBalances1.set(getDateEndTimestamp('2024-01-04'), BigInt(5000000)) // Jan 4 23:59 = 5 USDT
dailyBalances1.set(getDateStartTimestamp('2024-01-05'), BigInt(5000000)) // Jan 5 00:00 = 5 USDT
dailyBalances1.set(end1, balanceEnd1) // Jan 5 00:00 = 6 USDT

const new1 = simulateNewLogic(start1, end1, dailyBalances1)

console.log(`\nDifference: ${new1.total - old1.total} (${Number(new1.total - old1.total) / 1000000} USDT)`)

// Test Case 2: Uneven distribution with rounding
console.log('\n' + '='.repeat(80))
console.log('TEST CASE 2: Uneven distribution with BigInt rounding issues')
console.log('='.repeat(80))

const start2 = Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000)
const end2 = Math.floor(new Date('2024-01-06T00:00:00Z').getTime() / 1000)

const balanceStart2 = BigInt(0)
const balanceEnd2 = BigInt(123456789) // Intentionally not divisible by 6

const old2 = simulateOldLogic(start2, end2, balanceStart2, balanceEnd2)

// Simulate daily balances with uneven growth (cumulative)
const dailyBalances2 = new Map<number, bigint>()
dailyBalances2.set(start2, balanceStart2) // Jan 1 00:00 = 0
dailyBalances2.set(getDateEndTimestamp('2024-01-01'), BigInt(10000000)) // Jan 1 23:59 = 10
dailyBalances2.set(getDateStartTimestamp('2024-01-02'), BigInt(10000000)) // Jan 2 00:00 = 10
dailyBalances2.set(getDateEndTimestamp('2024-01-02'), BigInt(30000000)) // Jan 2 23:59 = 30 (big spike)
dailyBalances2.set(getDateStartTimestamp('2024-01-03'), BigInt(30000000)) // Jan 3 00:00 = 30
dailyBalances2.set(getDateEndTimestamp('2024-01-03'), BigInt(60000000)) // Jan 3 23:59 = 60
dailyBalances2.set(getDateStartTimestamp('2024-01-04'), BigInt(60000000)) // Jan 4 00:00 = 60
dailyBalances2.set(getDateEndTimestamp('2024-01-04'), BigInt(90000000)) // Jan 4 23:59 = 90
dailyBalances2.set(getDateStartTimestamp('2024-01-05'), BigInt(90000000)) // Jan 5 00:00 = 90
dailyBalances2.set(getDateEndTimestamp('2024-01-05'), BigInt(123456789)) // Jan 5 23:59 = 123.456789
dailyBalances2.set(getDateStartTimestamp('2024-01-06'), BigInt(123456789)) // Jan 6 00:00 = 123.456789
dailyBalances2.set(end2, balanceEnd2) // Jan 6 00:00 = 123.456789

const new2 = simulateNewLogic(start2, end2, dailyBalances2)

console.log(`\nDifference: ${new2.total - old2.total} (${Number(new2.total - old2.total) / 1000000} USDT)`)

// Test Case 3: Real-world scenario with partial end day
console.log('\n' + '='.repeat(80))
console.log('TEST CASE 3: Non-midnight timestamps')
console.log('='.repeat(80))

const start3 = Math.floor(new Date('2024-01-01T14:30:00Z').getTime() / 1000)
const end3 = Math.floor(new Date('2024-01-05T08:15:00Z').getTime() / 1000)

const balanceStart3 = BigInt(0)
const balanceEnd3 = BigInt(100000000) // 100 USDT

const old3 = simulateOldLogic(start3, end3, balanceStart3, balanceEnd3)

// Simulate cumulative growth with non-midnight boundaries
const dailyBalances3 = new Map<number, bigint>()
dailyBalances3.set(start3, balanceStart3) // Jan 1 14:30 = 0
dailyBalances3.set(getDateEndTimestamp('2024-01-01'), BigInt(5000000)) // Jan 1 23:59 = 5
dailyBalances3.set(getDateStartTimestamp('2024-01-02'), BigInt(5000000)) // Jan 2 00:00 = 5
dailyBalances3.set(getDateEndTimestamp('2024-01-02'), BigInt(25000000)) // Jan 2 23:59 = 25
dailyBalances3.set(getDateStartTimestamp('2024-01-03'), BigInt(25000000)) // Jan 3 00:00 = 25
dailyBalances3.set(getDateEndTimestamp('2024-01-03'), BigInt(50000000)) // Jan 3 23:59 = 50
dailyBalances3.set(getDateStartTimestamp('2024-01-04'), BigInt(50000000)) // Jan 4 00:00 = 50
dailyBalances3.set(getDateEndTimestamp('2024-01-04'), BigInt(80000000)) // Jan 4 23:59 = 80
dailyBalances3.set(getDateStartTimestamp('2024-01-05'), BigInt(80000000)) // Jan 5 00:00 = 80
dailyBalances3.set(end3, balanceEnd3) // Jan 5 08:15 = 100

const new3 = simulateNewLogic(start3, end3, dailyBalances3)

console.log(`\nDifference: ${new3.total - old3.total} (${Number(new3.total - old3.total) / 1000000} USDT)`)

console.log('\n' + '='.repeat(80))
console.log('SUMMARY')
console.log('='.repeat(80))
console.log('\nThe difference comes from:')
console.log('1. BigInt division truncation (old logic loses remainder)')
console.log('2. Different boundary handling for partial days')
console.log('\nThe NEW logic is more accurate because:')
console.log('- It captures actual daily fees without rounding loss')
console.log('- It shows real distribution patterns')
console.log('- Total equals sum of all daily queries (no truncation)')
