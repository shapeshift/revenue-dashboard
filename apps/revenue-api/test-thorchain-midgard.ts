/**
 * Validate ThorChain revenue tracking via Midgard
 *
 * Usage:
 *   bun --env-file=../../.env.local test-thorchain-midgard.ts
 *   bun --env-file=../../.env.local test-thorchain-midgard.ts --days 7
 */

import * as thorchain from './src/affiliateRevenue/thorchain'

const args = process.argv.slice(2)
const daysIdx = args.indexOf('--days')
const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 1

const endTimestamp = Math.floor(Date.now() / 1000)
const startTimestamp = endTimestamp - days * 86400

console.log(`=== ThorChain Midgard Validation (last ${days} day${days !== 1 ? 's' : ''}) ===\n`)
console.log(`Start: ${new Date(startTimestamp * 1000).toISOString()}`)
console.log(`End:   ${new Date(endTimestamp * 1000).toISOString()}\n`)

try {
  const fees = await thorchain.getFees(startTimestamp, endTimestamp)

  console.log(`Total fees: ${fees.length}`)

  if (fees.length === 0) {
    console.log('\nNo fees found for this period.')
    process.exit(0)
  }

  // Summary stats
  const withUsd = fees.filter(f => f.amountUsd !== undefined)
  const withoutUsd = fees.filter(f => f.amountUsd === undefined)
  const totalRune = fees.reduce((sum, f) => sum + parseInt(f.amount, 10) / 1e8, 0)
  const totalUsd = withUsd.reduce((sum, f) => sum + parseFloat(f.amountUsd!), 0)

  console.log(`\n=== Summary ===`)
  console.log(`Fees with USD price:    ${withUsd.length}`)
  console.log(`Fees without USD price: ${withoutUsd.length}`)
  console.log(`Total RUNE:             ${totalRune.toFixed(4)}`)
  console.log(`Total USD:              $${totalUsd.toFixed(2)}`)

  // Date range of results
  const timestamps = fees.map(f => f.timestamp).sort((a, b) => a - b)
  console.log(`\nDate range:`)
  console.log(`  Earliest: ${new Date(timestamps[0] * 1000).toISOString()}`)
  console.log(`  Latest:   ${new Date(timestamps[timestamps.length - 1] * 1000).toISOString()}`)

  // Sample fees
  console.log(`\n=== Sample fees (first 5) ===`)
  fees.slice(0, 5).forEach((fee, idx) => {
    const runeAmt = (parseInt(fee.amount, 10) / 1e8).toFixed(4)
    console.log(`\n[${idx + 1}] txHash: ${fee.txHash}`)
    console.log(`    amount:   ${runeAmt} RUNE (raw: ${fee.amount})`)
    console.log(`    amountUsd: ${fee.amountUsd !== undefined ? `$${parseFloat(fee.amountUsd).toFixed(4)}` : 'undefined (no price data)'}`)
    console.log(`    timestamp: ${new Date(fee.timestamp * 1000).toISOString()}`)
    console.log(`    assetId:   ${fee.assetId}`)
    console.log(`    chainId:   ${fee.chainId}`)
  })

  // Sanity checks
  console.log(`\n=== Sanity checks ===`)

  const uniqueTxHashes = new Set(fees.map(f => f.txHash))
  console.log(`Unique txHashes: ${uniqueTxHashes.size} / ${fees.length} ${uniqueTxHashes.size === fees.length ? '✓' : '⚠ duplicates found'}`)

  const allThorchain = fees.every(f => f.service === 'thorchain')
  console.log(`All service='thorchain': ${allThorchain ? '✓' : '✗'}`)

  const allHaveAmounts = fees.every(f => f.amount && parseInt(f.amount, 10) > 0)
  console.log(`All have positive amounts: ${allHaveAmounts ? '✓' : '✗'}`)

  const allHaveTimestamps = fees.every(f => f.timestamp > 0)
  console.log(`All have timestamps: ${allHaveTimestamps ? '✓' : '✗'}`)

  if (withoutUsd.length > 0) {
    console.log(`\n⚠ ${withoutUsd.length} fees missing USD price (gaps in Midgard price history)`)
  }
} catch (error) {
  console.error('\n❌ Error:', error)
  process.exit(1)
}
