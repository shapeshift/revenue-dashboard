/**
 * Test AVNU integration for the week of Jan 31 - Feb 6, 2026
 */

import { getFees } from './src/affiliateRevenue/avnu'

// Jan 31 - Feb 6, 2026
const START_TIMESTAMP = 1769817600 // Jan 31, 2026 00:00:00 UTC
const END_TIMESTAMP = 1770422399   // Feb 6, 2026 23:59:59 UTC

async function main() {
  console.log('=== Testing AVNU Integration for Jan 31 - Feb 6, 2026 ===\n')
  console.log(`Start: ${new Date(START_TIMESTAMP * 1000).toISOString()}`)
  console.log(`End: ${new Date(END_TIMESTAMP * 1000).toISOString()}\n`)

  const fees = await getFees(START_TIMESTAMP, END_TIMESTAMP)

  console.log(`\n=== RESULTS ===`)
  console.log(`Total fees: ${fees.length}\n`)

  if (fees.length === 0) {
    console.log('No fees found for this date range.')
    console.log('\nThis could mean:')
    console.log('1. No AVNU swaps occurred during this period')
    console.log('2. The treasury address or AVNU contract address may have changed')
    console.log('3. The integration is querying correctly but no revenue was generated')
    return
  }

  // Group by date
  const byDate = new Map<string, { count: number; totalUsd: number }>()

  for (const fee of fees) {
    const date = new Date(fee.timestamp * 1000).toISOString().split('T')[0]
    const existing = byDate.get(date) || { count: 0, totalUsd: 0 }
    existing.count++
    existing.totalUsd += fee.usdPrice || 0
    byDate.set(date, existing)
  }

  console.log('Breakdown by date:')
  for (const [date, data] of [...byDate.entries()].sort()) {
    console.log(`  ${date}: ${data.count} fees, $${data.totalUsd.toFixed(2)}`)
  }

  const totalUsd = fees.reduce((sum, fee) => sum + (fee.usdPrice || 0), 0)
  console.log(`\n=== TOTAL ===`)
  console.log(`Transactions: ${fees.length}`)
  console.log(`Total USD: $${totalUsd.toFixed(2)}`)

  // Show sample transactions
  console.log('\n=== SAMPLE TRANSACTIONS ===')
  fees.slice(0, 3).forEach((fee, idx) => {
    console.log(`\n${idx + 1}. ${fee.txHash}`)
    console.log(`   Asset: ${fee.assetId}`)
    console.log(`   Amount: ${fee.amount}`)
    console.log(`   USD: $${(fee.usdPrice || 0).toFixed(2)}`)
    console.log(`   Time: ${new Date(fee.timestamp * 1000).toISOString()}`)
  })
}

main().catch(console.error)
