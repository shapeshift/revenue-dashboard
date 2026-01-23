#!/usr/bin/env bun

/**
 * Direct comparison of old vs new ButterSwap logic
 * This simulates blockchain RPC calls to identify the exact cause of the $30 difference
 */

import { encodeAbiParameters, parseAbiParameters } from 'viem'

// Mock blockchain state - simulating ButterSwap cumulative balance growth
// These values represent what getTotalBalance() would return at different block heights
const MOCK_BLOCKCHAIN_STATE = new Map<number, bigint>([
  // Let's simulate 7 days of fees accumulating
  // Day 1: Jan 15, 2024 - 10 USDT accumulated
  [100000, BigInt(0)],           // Block at Jan 15 00:00 - start balance
  [117279, BigInt(10000000)],    // Block at Jan 15 23:59 - 10 USDT accumulated

  // Day 2: Jan 16 - 15 USDT more (total 25 USDT)
  [117280, BigInt(10000000)],    // Block at Jan 16 00:00
  [134559, BigInt(25000000)],    // Block at Jan 16 23:59

  // Day 3: Jan 17 - 20 USDT more (total 45 USDT)
  [134560, BigInt(25000000)],    // Block at Jan 17 00:00
  [151839, BigInt(45000000)],    // Block at Jan 17 23:59

  // Day 4: Jan 18 - 25 USDT more (total 70 USDT)
  [151840, BigInt(45000000)],    // Block at Jan 18 00:00
  [169119, BigInt(70000000)],    // Block at Jan 18 23:59

  // Day 5: Jan 19 - 30 USDT more (total 100 USDT)
  [169120, BigInt(70000000)],    // Block at Jan 19 00:00
  [186399, BigInt(100000000)],   // Block at Jan 19 23:59

  // Day 6: Jan 20 - 20 USDT more (total 120 USDT)
  [186400, BigInt(100000000)],   // Block at Jan 20 00:00
  [203679, BigInt(120000000)],   // Block at Jan 20 23:59

  // Day 7: Jan 21 - 30 USDT more (total 150 USDT)
  [203680, BigInt(120000000)],   // Block at Jan 21 00:00
  [220959, BigInt(150000000)],   // Block at Jan 21 23:59

  // Final query point
  [220960, BigInt(150000000)],   // Block at Jan 22 00:00
])

// Simulate block estimation
const estimateBlockFromTimestamp = (
  currentBlock: number,
  currentTime: number,
  targetTime: number,
  blockTime: number
): number => {
  const timeDiff = targetTime - currentTime
  const blockDiff = Math.floor(timeDiff / blockTime)
  return currentBlock + blockDiff
}

// Mock getTotalBalance (simulates RPC call)
const getTotalBalance = (blockNumber: number): bigint => {
  // Find closest block in our mock state
  const blocks = Array.from(MOCK_BLOCKCHAIN_STATE.keys()).sort((a, b) => a - b)

  let closestBlock = blocks[0]
  for (const block of blocks) {
    if (block <= blockNumber) {
      closestBlock = block
    } else {
      break
    }
  }

  return MOCK_BLOCKCHAIN_STATE.get(closestBlock) ?? BigInt(0)
}

// Cache functions
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

// OLD IMPLEMENTATION
const getFees_OLD = (startTimestamp: number, endTimestamp: number): Array<{ date: string, amount: bigint }> => {
  console.log('\n' + '='.repeat(80))
  console.log('OLD IMPLEMENTATION (Averaged)')
  console.log('='.repeat(80))

  const currentBlock = 220960
  const now = Math.floor(Date.now() / 1000)
  const BLOCK_TIME = 5

  const startBlock = estimateBlockFromTimestamp(currentBlock, now, startTimestamp, BLOCK_TIME)
  const endBlock = estimateBlockFromTimestamp(currentBlock, now, endTimestamp, BLOCK_TIME)

  console.log(`Query range: ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`)
  console.log(`Start block: ${startBlock}, End block: ${endBlock}`)

  const balanceAtStart = getTotalBalance(startBlock)
  const balanceAtEnd = getTotalBalance(endBlock)

  console.log(`Balance at start: ${balanceAtStart} (${Number(balanceAtStart) / 1000000} USDT)`)
  console.log(`Balance at end: ${balanceAtEnd} (${Number(balanceAtEnd) / 1000000} USDT)`)

  const feesForPeriod = balanceAtEnd - balanceAtStart
  console.log(`Total fees for period: ${feesForPeriod} (${Number(feesForPeriod) / 1000000} USDT)`)

  if (feesForPeriod <= BigInt(0)) {
    console.log('No fees for period')
    return []
  }

  const dates = getDateRange(startTimestamp, endTimestamp)
  const numDays = dates.length
  const feesPerDay = feesForPeriod / BigInt(numDays)

  console.log(`Number of dates: ${numDays}`)
  console.log(`Fees per day (BigInt division): ${feesPerDay} (${Number(feesPerDay) / 1000000} USDT)`)
  console.log(`Lost to rounding: ${feesForPeriod - (feesPerDay * BigInt(numDays))} (${Number(feesForPeriod - (feesPerDay * BigInt(numDays))) / 1000000} USDT)`)

  const fees = dates.map(date => ({
    date,
    amount: feesPerDay,
  }))

  const total = feesPerDay * BigInt(numDays)
  console.log(`\nTotal reported: ${total} (${Number(total) / 1000000} USDT)`)

  return fees
}

// NEW IMPLEMENTATION
const getFees_NEW = (startTimestamp: number, endTimestamp: number): Array<{ date: string, amount: bigint }> => {
  console.log('\n' + '='.repeat(80))
  console.log('NEW IMPLEMENTATION (Daily Granularity)')
  console.log('='.repeat(80))

  const currentBlock = 220960
  const now = Math.floor(Date.now() / 1000)
  const BLOCK_TIME = 5

  const dates = getDateRange(startTimestamp, endTimestamp)
  const fees: Array<{ date: string, amount: bigint }> = []

  console.log(`Query range: ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`)
  console.log(`Number of dates: ${dates.length}`)
  console.log('')

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]
    const isFirstDay = i === 0
    const isLastDay = i === dates.length - 1

    const dayStart = isFirstDay ? startTimestamp : getDateStartTimestamp(date)
    const dayEnd = isLastDay ? endTimestamp : getDateEndTimestamp(date)

    const startBlock = estimateBlockFromTimestamp(currentBlock, now, dayStart, BLOCK_TIME)
    const endBlock = estimateBlockFromTimestamp(currentBlock, now, dayEnd, BLOCK_TIME)

    const balanceAtDayStart = getTotalBalance(startBlock)
    const balanceAtDayEnd = getTotalBalance(endBlock)

    const feesForDay = balanceAtDayEnd - balanceAtDayStart

    console.log(`${date}: Block ${startBlock} to ${endBlock}`)
    console.log(`  ${new Date(dayStart * 1000).toISOString()} to ${new Date(dayEnd * 1000).toISOString()}`)
    console.log(`  Balance: ${balanceAtDayStart} → ${balanceAtDayEnd}`)
    console.log(`  Fees: ${feesForDay} (${Number(feesForDay) / 1000000} USDT)`)

    if (feesForDay > BigInt(0)) {
      fees.push({ date, amount: feesForDay })
    } else {
      console.log(`  (Skipped - zero fees)`)
    }
  }

  const total = fees.reduce((sum, f) => sum + f.amount, BigInt(0))
  console.log(`\nTotal reported: ${total} (${Number(total) / 1000000} USDT)`)

  return fees
}

// TEST SCENARIO 1: Midnight-aligned query (typical dashboard query)
console.log('\n' + '#'.repeat(80))
console.log('SCENARIO 1: Midnight-aligned timestamps (Jan 15 00:00 to Jan 22 00:00)')
console.log('#'.repeat(80))

const start1 = Math.floor(new Date('2024-01-15T00:00:00Z').getTime() / 1000)
const end1 = Math.floor(new Date('2024-01-22T00:00:00Z').getTime() / 1000)

const old1 = getFees_OLD(start1, end1)
const new1 = getFees_NEW(start1, end1)

const oldTotal1 = old1.reduce((sum, f) => sum + f.amount, BigInt(0))
const newTotal1 = new1.reduce((sum, f) => sum + f.amount, BigInt(0))
const diff1 = newTotal1 - oldTotal1

console.log('\n' + '='.repeat(80))
console.log('COMPARISON')
console.log('='.repeat(80))
console.log(`Old total: ${Number(oldTotal1) / 1000000} USDT`)
console.log(`New total: ${Number(newTotal1) / 1000000} USDT`)
console.log(`Difference: ${Number(diff1) / 1000000} USDT (${diff1 > 0 ? '+' : ''}${((Number(diff1) / Number(oldTotal1)) * 100).toFixed(2)}%)`)

if (diff1 === BigInt(0)) {
  console.log('✓ Totals match!')
} else if (diff1 > BigInt(0)) {
  console.log('⚠️  New implementation reports MORE revenue')
} else {
  console.log('⚠️  New implementation reports LESS revenue')
}

// TEST SCENARIO 2: Non-midnight query (edge case)
console.log('\n\n' + '#'.repeat(80))
console.log('SCENARIO 2: Non-midnight timestamps (Jan 15 14:30 to Jan 21 08:15)')
console.log('#'.repeat(80))

const start2 = Math.floor(new Date('2024-01-15T14:30:00Z').getTime() / 1000)
const end2 = Math.floor(new Date('2024-01-21T08:15:00Z').getTime() / 1000)

const old2 = getFees_OLD(start2, end2)
const new2 = getFees_NEW(start2, end2)

const oldTotal2 = old2.reduce((sum, f) => sum + f.amount, BigInt(0))
const newTotal2 = new2.reduce((sum, f) => sum + f.amount, BigInt(0))
const diff2 = newTotal2 - oldTotal2

console.log('\n' + '='.repeat(80))
console.log('COMPARISON')
console.log('='.repeat(80))
console.log(`Old total: ${Number(oldTotal2) / 1000000} USDT`)
console.log(`New total: ${Number(newTotal2) / 1000000} USDT`)
console.log(`Difference: ${Number(diff2) / 1000000} USDT (${diff2 > 0 ? '+' : ''}${((Number(diff2) / Number(oldTotal2)) * 100).toFixed(2)}%)`)

if (diff2 === BigInt(0)) {
  console.log('✓ Totals match!')
} else if (diff2 > BigInt(0)) {
  console.log('⚠️  New implementation reports MORE revenue')
} else {
  console.log('⚠️  New implementation reports LESS revenue')
}

// SUMMARY
console.log('\n\n' + '#'.repeat(80))
console.log('SUMMARY & ROOT CAUSE ANALYSIS')
console.log('#'.repeat(80))
console.log(`
The $30 difference is likely caused by one of these factors:

1. **BigInt Division Truncation** (OLD loses remainder)
   - Old: Total ÷ Days = PerDay (truncated) × Days ≠ Total
   - New: Sum of actual daily queries = Exact total

2. **Boundary Handling** (getDateRange includes both endpoints)
   - If query is Jan 1 00:00 to Jan 5 00:00 (4 days of fees)
   - getDateRange returns 5 dates: ["Jan 1", "Jan 2", "Jan 3", "Jan 4", "Jan 5"]
   - Old: 4 days fees ÷ 5 dates = under-reports by 20%
   - New: Last day (Jan 5) has 0 fees when endTimestamp is midnight

3. **Which is Correct?**
   - NEW is correct: Shows actual blockchain state changes per day
   - OLD was pragmatic approximation for performance
`)
