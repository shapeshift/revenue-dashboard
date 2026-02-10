/**
 * Test with very recent data (last 24 hours)
 */

import { getFees } from './src/affiliateRevenue/avnu'

// Last 24 hours
const now = Math.floor(Date.now() / 1000)
const START_TIMESTAMP = now - 86400 // 24 hours ago
const END_TIMESTAMP = now

async function main() {
  console.log('=== Testing AVNU Integration for Last 24 Hours ===\n')
  console.log(`Start: ${new Date(START_TIMESTAMP * 1000).toISOString()}`)
  console.log(`End: ${new Date(END_TIMESTAMP * 1000).toISOString()}\n`)

  const fees = await getFees(START_TIMESTAMP, END_TIMESTAMP)

  console.log(`\n=== RESULTS ===`)
  console.log(`Total fees: ${fees.length}\n`)

  if (fees.length === 0) {
    console.log('No fees found in last 24 hours.')
    console.log('AVNU may not be actively used or the integration needs verification.')
    return
  }

  const totalUsd = fees.reduce((sum, fee) => sum + (fee.usdPrice || 0), 0)
  console.log(`Total USD: $${totalUsd.toFixed(2)}\n`)

  console.log('Recent transactions:')
  fees.slice(0, 5).forEach((fee, idx) => {
    console.log(`\n${idx + 1}. ${fee.txHash}`)
    console.log(`   Asset: ${fee.assetId}`)
    console.log(`   Amount: ${fee.amount}`)
    console.log(`   USD: $${(fee.usdPrice || 0).toFixed(2)}`)
    console.log(`   Time: ${new Date(fee.timestamp * 1000).toISOString()}`)
  })
}

main().catch(console.error)
