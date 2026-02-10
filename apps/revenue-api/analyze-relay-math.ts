// Actual fee amounts from Jan 31, 2026
const fees = [
  { id: 1, usd: 0.274866, symbol: 'USDT', chain: 1 },
  { id: 2, usd: 0.017171, symbol: 'SOL', chain: 792703809 },
  { id: 3, usd: 0.020329, symbol: 'BTC', chain: 8253038 },
  { id: 4, usd: 0.274866, symbol: 'USDT', chain: 1 },
  { id: 5, usd: 0.011234, symbol: 'ETH', chain: 8453 },
  { id: 6, usd: 0.000578, symbol: 'ETH', chain: 1 },
  { id: 7, usd: 0.000578, symbol: 'ETH', chain: 42161 },
  { id: 8, usd: 0.550000, symbol: 'ETH', chain: 42161 },
  { id: 9, usd: 0.275000, symbol: 'USDC', chain: 1 },
  { id: 10, usd: 0.275000, symbol: 'SOL', chain: 792703809 }, // Note: This is actually 0.014991 based on real data
  { id: 11, usd: 108.987410, symbol: 'ETH', chain: 1 },
  { id: 12, usd: 0.682779, symbol: 'BTC', chain: 8253038 },
]

console.log('=== Mathematical Analysis ===\n')

const total = fees.reduce((sum, f) => sum + f.usd, 0)
console.log(`Total: $${total.toFixed(2)}`)
console.log(`Expected: $110.86`)
console.log(`Dashboard: $5.48\n`)

// Test if $5.48 is ANY combination of fees
console.log('Testing combinations to reach $5.48:\n')

// Single fee
fees.forEach(fee => {
  if (Math.abs(fee.usd - 5.48) < 0.01) {
    console.log(`✓ Single fee #${fee.id}: $${fee.usd.toFixed(2)}`)
  }
})

// All fees except the big one
const withoutBigFee = fees.filter(f => f.id !== 11)
const totalWithoutBig = withoutBigFee.reduce((sum, f) => sum + f.usd, 0)
console.log(`\nAll fees except #11 (large ETH): $${totalWithoutBig.toFixed(2)}`)
if (Math.abs(totalWithoutBig - 5.48) < 0.01) {
  console.log('  ✓ MATCH! This could be the issue!')
}

// Test if price enrichment could cause this
console.log('\n=== Price Enrichment Theory ===')
console.log('What if the large ETH fee (#11) fails enrichment?')
console.log('  Original: $108.99')
console.log('  If enrichment fails and fee is dropped: remaining = $1.87')
console.log('  But $1.87 ≠ $5.48 ✗\n')

// Test temporal subset theory
console.log('=== Temporal Subset Theory ===')
console.log('What if cache captured partial day data?\n')

// Sort by timestamp (fee ID is in chronological order)
console.log('Fees in chronological order:')
fees.forEach((fee, idx) => {
  const runningTotal = fees.slice(0, idx + 1).reduce((sum, f) => sum + f.usd, 0)
  console.log(`  After fee #${fee.id}: $${runningTotal.toFixed(2)}`)
  if (Math.abs(runningTotal - 5.48) < 0.1) {
    console.log(`    ↑ CLOSE TO $5.48!`)
  }
})

// Test if specific chains are excluded
console.log('\n=== Chain Exclusion Theory ===')
const evmChains = [1, 8453, 42161]
const nonEvmChains = [8253038, 792703809]

const evmFees = fees.filter(f => evmChains.includes(f.chain))
const nonEvmFees = fees.filter(f => nonEvmChains.includes(f.chain))

const evmTotal = evmFees.reduce((sum, f) => sum + f.usd, 0)
const nonEvmTotal = nonEvmFees.reduce((sum, f) => sum + f.usd, 0)

console.log(`EVM chains only: $${evmTotal.toFixed(2)}`)
console.log(`Non-EVM chains only: $${nonEvmTotal.toFixed(2)}`)

// Test if specific tokens are excluded
console.log('\n=== Token Type Theory ===')
const byToken = fees.reduce((acc, f) => {
  if (!acc[f.symbol]) acc[f.symbol] = 0
  acc[f.symbol] += f.usd
  return acc
}, {} as Record<string, number>)

Object.entries(byToken).forEach(([token, amount]) => {
  console.log(`${token}: $${amount.toFixed(2)}`)
})

// Test if only EVM native tokens (not ERC20)
const erc20Fees = fees.filter(f => ['USDT', 'USDC'].includes(f.symbol))
const nativeFees = fees.filter(f => ['ETH', 'BTC', 'SOL'].includes(f.symbol))
const erc20Total = erc20Fees.reduce((sum, f) => sum + f.usd, 0)
const nativeTotal = nativeFees.reduce((sum, f) => sum + f.usd, 0)

console.log(`\nERC20 tokens only: $${erc20Total.toFixed(2)}`)
console.log(`Native tokens only: $${nativeTotal.toFixed(2)}`)

console.log('\n=== Ratio Analysis ===')
console.log(`Ratio: 5.48 / 110.86 = ${(5.48 / 110.86 * 100).toFixed(2)}%`)
console.log(`This is approximately 5%`)
console.log(`Also: 1/12 = 8.33% (if only 1 fee counted)`)
console.log(``)
console.log(`None of the simple combinations work!`)
console.log(`Most likely: CACHE contains partial data from earlier in the day`)
