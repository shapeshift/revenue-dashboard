/**
 * Test AVNU for December 2025 to see if there's any historical data
 */

import { getFees } from './src/affiliateRevenue/avnu'

// December 2025
const START_TIMESTAMP = 1733011200 // Dec 1, 2025 00:00:00 UTC
const END_TIMESTAMP = 1735689599   // Dec 31, 2025 23:59:59 UTC

async function main() {
  console.log('=== Testing AVNU Integration for December 2025 ===\n')
  console.log(`Start: ${new Date(START_TIMESTAMP * 1000).toISOString()}`)
  console.log(`End: ${new Date(END_TIMESTAMP * 1000).toISOString()}\n`)

  const fees = await getFees(START_TIMESTAMP, END_TIMESTAMP)

  console.log(`\n=== RESULTS ===`)
  console.log(`Total fees: ${fees.length}\n`)

  if (fees.length === 0) {
    console.log('No fees found for December 2025.')
    return
  }

  // Group by date
  const byDate = new Map<string, number>()
  for (const fee of fees) {
    const date = new Date(fee.timestamp * 1000).toISOString().split('T')[0]
    byDate.set(date, (byDate.get(date) || 0) + 1)
  }

  console.log('Daily breakdown:')
  for (const [date, count] of [...byDate.entries()].sort()) {
    console.log(`  ${date}: ${count} fees`)
  }

  const totalUsd = fees.reduce((sum, fee) => sum + (fee.usdPrice || 0), 0)
  console.log(`\nTotal USD: $${totalUsd.toFixed(2)}`)

  console.log('\nSample transactions:')
  fees.slice(0, 3).forEach((fee, idx) => {
    console.log(`\n${idx + 1}. ${fee.txHash}`)
    console.log(`   Asset: ${fee.assetId}`)
    console.log(`   USD: $${(fee.usdPrice || 0).toFixed(2)}`)
    console.log(`   Time: ${new Date(fee.timestamp * 1000).toISOString()}`)
  })
}

main().catch(console.error)
