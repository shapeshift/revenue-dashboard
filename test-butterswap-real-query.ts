#!/usr/bin/env bun

/**
 * Query real ButterSwap API to understand the $30 difference
 */

const API_URL = 'http://localhost:4200/api/affiliate-revenue'

// Get dates from last 30 days
const now = Date.now()
const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

const startTimestamp = Math.floor(thirtyDaysAgo / 1000)
const endTimestamp = Math.floor(now / 1000)

console.log('Querying ButterSwap fees from last 30 days...')
console.log(`Start: ${new Date(startTimestamp * 1000).toISOString()}`)
console.log(`End: ${new Date(endTimestamp * 1000).toISOString()}`)
console.log(`\nTimestamp range: ${startTimestamp} to ${endTimestamp}`)

// Check what getDateRange would return
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
console.log(`\ngetDateRange returns ${dates.length} dates:`)
console.log(`First: ${dates[0]}`)
console.log(`Last: ${dates[dates.length - 1]}`)

// Check if endTimestamp is at midnight
const endDate = new Date(endTimestamp * 1000)
const isEndAtMidnight = endDate.getUTCHours() === 0 && endDate.getUTCMinutes() === 0 && endDate.getUTCSeconds() === 0

console.log(`\nIs endTimestamp at midnight? ${isEndAtMidnight}`)
console.log(`End time: ${endDate.toISOString()}`)

try {
  console.log('\nQuerying API...')
  const response = await fetch(`${API_URL}?start=${startTimestamp}&end=${endTimestamp}`)
  const data = await response.json()

  const butterswapFees = data.fees.filter((f: any) => f.service === 'butterswap')

  console.log(`\nFound ${butterswapFees.length} ButterSwap fee entries`)

  let total = 0
  butterswapFees.forEach((fee: any) => {
    const amountUsd = parseFloat(fee.amountUsd)
    total += amountUsd
    const date = new Date(fee.timestamp * 1000).toISOString().split('T')[0]
    console.log(`${date}: $${amountUsd.toFixed(2)}`)
  })

  console.log(`\nTotal ButterSwap revenue: $${total.toFixed(2)}`)

  // Check for potential issues
  console.log('\n' + '='.repeat(80))
  console.log('ANALYSIS')
  console.log('='.repeat(80))

  if (butterswapFees.length > dates.length) {
    console.log('⚠️  More fee entries than dates! Possible duplicate day issue.')
  } else if (butterswapFees.length < dates.length) {
    console.log('✓ Fewer fee entries than dates (expected - days with zero fees are skipped)')
  } else {
    console.log('ℹ️  Fee entries match date count')
  }

  if (!isEndAtMidnight) {
    console.log('ℹ️  End timestamp is NOT at midnight - partial last day is included')
  } else {
    console.log('ℹ️  End timestamp IS at midnight - last day should have zero fees')
    const lastDate = dates[dates.length - 1]
    const hasLastDayFees = butterswapFees.some((f: any) => {
      const feeDate = new Date(f.timestamp * 1000).toISOString().split('T')[0]
      return feeDate === lastDate
    })
    if (hasLastDayFees) {
      console.log('⚠️  WARNING: Last day has fees but endTimestamp is at midnight!')
      console.log('   This could cause the $30 difference.')
    }
  }

} catch (error) {
  console.error('Error querying API:', error)
  console.log('\nMake sure the API server is running: bun dev')
}
