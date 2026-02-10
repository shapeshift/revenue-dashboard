/**
 * Simple test using the actual AVNU integration code
 */

import { getFees } from './src/affiliateRevenue/avnu'

// Jan 31, 2026 UTC
const START_TIMESTAMP = 1769817600
const END_TIMESTAMP = 1769903999

async function main() {
  console.log('=== Testing AVNU Integration for January 31, 2026 ===\n')
  console.log(`Start: ${new Date(START_TIMESTAMP * 1000).toISOString()}`)
  console.log(`End: ${new Date(END_TIMESTAMP * 1000).toISOString()}\n`)

  const fees = await getFees(START_TIMESTAMP, END_TIMESTAMP)

  console.log(`\n=== RESULTS ===`)
  console.log(`Total fees: ${fees.length}\n`)

  if (fees.length === 0) {
    console.log('No fees found for this date range.')
    return
  }

  // Group by token
  const byToken = new Map<string, { count: number; totalAmount: bigint; totalUsd: number }>()

  for (const fee of fees) {
    const existing = byToken.get(fee.assetId) || { count: 0, totalAmount: 0n, totalUsd: 0 }
    existing.count++
    existing.totalAmount += BigInt(fee.amount)
    existing.totalUsd += fee.usdPrice || 0
    byToken.set(fee.assetId, existing)
  }

  console.log('Breakdown by token:')
  for (const [assetId, data] of byToken.entries()) {
    console.log(`\n${assetId}:`)
    console.log(`  Transactions: ${data.count}`)
    console.log(`  Total amount: ${data.totalAmount.toString()}`)
    console.log(`  Total USD: $${data.totalUsd.toFixed(2)}`)
  }

  const totalUsd = fees.reduce((sum, fee) => sum + (fee.usdPrice || 0), 0)
  console.log(`\n=== TOTAL USD VALUE ===`)
  console.log(`$${totalUsd.toFixed(2)}`)

  console.log('\n=== FIRST 5 TRANSACTIONS ===')
  fees.slice(0, 5).forEach((fee, idx) => {
    console.log(`\n${idx + 1}. ${fee.txHash}`)
    console.log(`   Asset: ${fee.assetId}`)
    console.log(`   Amount: ${fee.amount}`)
    console.log(`   USD: $${(fee.usdPrice || 0).toFixed(2)}`)
    console.log(`   Time: ${new Date(fee.timestamp * 1000).toISOString()}`)
  })
}

main().catch(console.error)
