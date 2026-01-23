#!/usr/bin/env bun

/**
 * Analyze the exact timestamps being queried in OLD vs NEW logic
 */

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

// Dashboard date range
const startTimestamp = Math.floor(new Date('2025-12-24T00:00:00Z').getTime() / 1000)
const endTimestamp = Math.floor(new Date('2026-01-22T00:00:00Z').getTime() / 1000)

console.log('='.repeat(80))
console.log('OLD IMPLEMENTATION - Single Query')
console.log('='.repeat(80))
console.log(`\nQueries TWO blocks:`)
console.log(`  Start: ${startTimestamp} (${new Date(startTimestamp * 1000).toISOString()})`)
console.log(`  End:   ${endTimestamp} (${new Date(endTimestamp * 1000).toISOString()})`)
console.log(`\nCaptures: Balance[end] - Balance[start]`)
console.log(`Time span: ${(endTimestamp - startTimestamp) / (24 * 60 * 60)} days`)

console.log('\n' + '='.repeat(80))
console.log('NEW IMPLEMENTATION - Daily Queries')
console.log('='.repeat(80))

const dates = getDateRange(startTimestamp, endTimestamp)
console.log(`\nQueries ${dates.length} dates, ${dates.length * 2} total RPC calls:`)

let totalSecondsQueried = 0
const allQueriedRanges: Array<{ start: number, end: number, date: string }> = []

for (let i = 0; i < dates.length; i++) {
  const date = dates[i]
  const isFirstDay = i === 0
  const isLastDay = i === dates.length - 1

  const dayStart = isFirstDay ? startTimestamp : getDateStartTimestamp(date)
  const dayEnd = isLastDay ? endTimestamp : getDateEndTimestamp(date)

  const seconds = dayEnd - dayStart
  totalSecondsQueried += seconds

  allQueriedRanges.push({ start: dayStart, end: dayEnd, date })

  if (i < 3 || i >= dates.length - 3) {
    console.log(`\n${date} (${isFirstDay ? 'FIRST' : isLastDay ? 'LAST' : 'middle'}):`)
    console.log(`  Start: ${dayStart} (${new Date(dayStart * 1000).toISOString()})`)
    console.log(`  End:   ${dayEnd} (${new Date(dayEnd * 1000).toISOString()})`)
    console.log(`  Span:  ${seconds} seconds (${(seconds / (24 * 60 * 60)).toFixed(4)} days)`)
    console.log(`  Query: Balance[${dayEnd}] - Balance[${dayStart}]`)
  } else if (i === 3) {
    console.log(`\n... (${dates.length - 6} more days) ...`)
  }
}

console.log(`\nTotal seconds queried: ${totalSecondsQueried}`)
console.log(`Total days queried: ${(totalSecondsQueried / (24 * 60 * 60)).toFixed(4)}`)

// Check for gaps or overlaps
console.log('\n' + '='.repeat(80))
console.log('GAP/OVERLAP ANALYSIS')
console.log('='.repeat(80))

let foundGaps = false
let foundOverlaps = false

for (let i = 0; i < allQueriedRanges.length - 1; i++) {
  const current = allQueriedRanges[i]
  const next = allQueriedRanges[i + 1]

  const gap = next.start - current.end

  if (gap > 1) {
    console.log(`\n⚠️  GAP between ${current.date} and ${next.date}:`)
    console.log(`  ${current.date} ends at:   ${current.end} (${new Date(current.end * 1000).toISOString()})`)
    console.log(`  ${next.date} starts at: ${next.start} (${new Date(next.start * 1000).toISOString()})`)
    console.log(`  Missing: ${gap} seconds`)
    foundGaps = true
  } else if (gap < 0) {
    console.log(`\n⚠️  OVERLAP between ${current.date} and ${next.date}:`)
    console.log(`  ${current.date} ends at:   ${current.end} (${new Date(current.end * 1000).toISOString()})`)
    console.log(`  ${next.date} starts at: ${next.start} (${new Date(next.start * 1000).toISOString()})`)
    console.log(`  Overlap: ${Math.abs(gap)} seconds`)
    foundOverlaps = true
  }
}

if (!foundGaps && !foundOverlaps) {
  console.log('\n✓ No gaps or overlaps detected')
  console.log('\nBut wait! Let me check the 1-second gaps between 23:59:59 and 00:00:00...')

  let totalGaps = 0
  for (let i = 0; i < allQueriedRanges.length - 1; i++) {
    const current = allQueriedRanges[i]
    const next = allQueriedRanges[i + 1]
    const gap = next.start - current.end
    if (gap > 0) {
      totalGaps += gap
    }
  }

  console.log(`\nTotal 1-second gaps between days: ${totalGaps} seconds`)
  console.log(`This represents ${totalGaps} seconds of potentially unqueried time`)
  console.log(`\n⚠️  Each day boundary has a 1-second gap!`)
  console.log(`   Dec 24 23:59:59 → Dec 25 00:00:00 (gap: 1 second)`)
  console.log(`   Dec 25 23:59:59 → Dec 26 00:00:00 (gap: 1 second)`)
  console.log(`   ...`)
  console.log(`\nIf transactions happen in these gaps, they might be missed!`)
}

console.log('\n' + '='.repeat(80))
console.log('TOTAL COVERAGE COMPARISON')
console.log('='.repeat(80))

const oldCoverage = endTimestamp - startTimestamp
const newCoverage = totalSecondsQueried + (dates.length - 1) // Add back the 1-second gaps

console.log(`\nOLD implementation coverage:`)
console.log(`  ${oldCoverage} seconds (${(oldCoverage / (24 * 60 * 60)).toFixed(4)} days)`)

console.log(`\nNEW implementation coverage:`)
console.log(`  ${totalSecondsQueried} seconds without gaps`)
console.log(`  ${newCoverage} seconds with 1-sec gaps included`)
console.log(`  ${(totalSecondsQueried / (24 * 60 * 60)).toFixed(4)} days without gaps`)
console.log(`  ${(newCoverage / (24 * 60 * 60)).toFixed(4)} days with gaps`)

const difference = oldCoverage - totalSecondsQueried
console.log(`\nDifference: ${difference} seconds (${(difference / (24 * 60 * 60)).toFixed(4)} days)`)

if (Math.abs(difference) === dates.length - 1) {
  console.log(`\n✓ Difference equals number of 1-second gaps between days`)
  console.log(`  This is expected and should not cause significant revenue differences`)
} else {
  console.log(`\n⚠️  Unexpected coverage difference!`)
}
