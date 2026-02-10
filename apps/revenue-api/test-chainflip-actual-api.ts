/**
 * Test script to query actual Chainflip API for Jan 31, 2026
 * and verify what data is being returned
 */

import * as chainflip from './src/affiliateRevenue/chainflip'

console.log('=== Chainflip Actual API Test ===\n')

// Jan 31, 2026: 00:00:00 UTC to 23:59:59 UTC
const startTimestamp = Math.floor(new Date('2026-01-31T00:00:00Z').getTime() / 1000)
const endTimestamp = Math.floor(new Date('2026-01-31T23:59:59Z').getTime() / 1000)

console.log('Query parameters:')
console.log(`  Start: ${startTimestamp} (${new Date(startTimestamp * 1000).toISOString()})`)
console.log(`  End: ${endTimestamp} (${new Date(endTimestamp * 1000).toISOString()})`)

try {
  const fees = await chainflip.getFees(startTimestamp, endTimestamp)

  console.log(`\nTotal fees returned: ${fees.length}`)

  if (fees.length === 0) {
    console.log('\n⚠️  NO FEES RETURNED - This explains the discrepancy!')
    console.log('   The API is not returning data for this date.')
  } else {
    let totalAmountUsd = 0

    console.log('\nFee details:')
    for (let i = 0; i < fees.length; i++) {
      const fee = fees[i]
      console.log(`\n[${i + 1}]:`)
      console.log(`  service: "${fee.service}"`)
      console.log(`  amount: "${fee.amount}"`)
      console.log(`  amountUsd: "${fee.amountUsd}"`)
      console.log(`  timestamp: ${fee.timestamp} (${new Date(fee.timestamp * 1000).toISOString()})`)
      console.log(`  assetId: ${fee.assetId}`)
      console.log(`  chainId: ${fee.chainId}`)

      const parsedAmount = parseFloat(fee.amountUsd || '0')
      console.log(`  parseFloat(amountUsd): ${parsedAmount}`)
      totalAmountUsd += parsedAmount
    }

    console.log('\n=== Summary ===')
    console.log(`Total fees: ${fees.length}`)
    console.log(`Sum of amountUsd values: ${totalAmountUsd}`)
    console.log(`Expected from investigation: 0.77`)
    console.log(`Match: ${totalAmountUsd === 0.77 ? '✓ YES' : '✗ NO'}`)

    if (totalAmountUsd !== 0.77) {
      console.log(`\nDiscrepancy: ${Math.abs(totalAmountUsd - 0.77)}`)
      console.log('Possible issues:')
      console.log('  - API returning different data than expected')
      console.log('  - Date range issue')
      console.log('  - Caching showing stale data')
    }
  }
} catch (error) {
  console.error('\n❌ Error querying Chainflip API:')
  console.error(error)
}
