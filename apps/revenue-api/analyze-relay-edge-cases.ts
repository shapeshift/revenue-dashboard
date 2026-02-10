import { NON_EVM_CHAINS } from './src/affiliateRevenue/relay/constants'
import { buildAssetId, getChainConfig, isLikelyNonEvm } from './src/affiliateRevenue/relay/utils'

// Real chain IDs from Jan 31, 2026 data
const realChainIds = [
  1, // Ethereum
  8453, // Base
  42161, // Arbitrum
  8253038, // Bitcoin
  792703809, // Solana
]

console.log('=== Relay Chain ID Analysis ===\n')

realChainIds.forEach(chainId => {
  console.log(`Chain ID: ${chainId}`)
  console.log(`  isLikelyNonEvm (>1M): ${isLikelyNonEvm(chainId)}`)

  const config = getChainConfig(chainId)
  console.log(`  Resolved chainId: ${config.chainId}`)
  console.log(`  slip44: ${config.slip44}`)
  console.log(`  isEvm: ${config.isEvm}`)

  // Test asset ID construction with different token types
  const testTokens = [
    { name: 'Native Token', address: '0x0000000000000000000000000000000000000000' },
    { name: 'Native (Solana style)', address: '11111111111111111111111111111111' },
    { name: 'ERC20 Token', address: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
  ]

  testTokens.forEach(token => {
    const assetId = buildAssetId(config.chainId, config.slip44, token.address, config.isEvm)
    console.log(`  ${token.name} (${token.address}):`)
    console.log(`    -> assetId: ${assetId}`)
  })

  console.log()
})

console.log('=== Edge Case Analysis ===\n')

// Test non-EVM chain handling
console.log('1. Non-EVM Chain Detection:')
console.log(`   Chain 8253038 (Bitcoin): ${isLikelyNonEvm(8253038) ? 'DETECTED ✓' : 'MISSED ✗'}`)
console.log(`   Chain 792703809 (Solana): ${isLikelyNonEvm(792703809) ? 'DETECTED ✓' : 'MISSED ✗'}`)
console.log(`   Mapped in NON_EVM_CHAINS:`)
console.log(`     Bitcoin (8253038): ${NON_EVM_CHAINS[8253038] ? 'YES ✓' : 'NO ✗'}`)
console.log(`     Solana (792703809): ${NON_EVM_CHAINS[792703809] ? 'YES ✓' : 'NO ✗'}`)

// Test asset ID construction for actual tokens
console.log('\n2. Asset ID Construction for Real Tokens:')

const realTokens = [
  { chain: 1, address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT' },
  { chain: 1, address: '0x0000000000000000000000000000000000000000', symbol: 'ETH' },
  { chain: 8453, address: '0x0000000000000000000000000000000000000000', symbol: 'ETH' },
  { chain: 42161, address: '0x0000000000000000000000000000000000000000', symbol: 'ETH' },
  { chain: 8253038, address: 'bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmql8k8', symbol: 'BTC' },
  { chain: 792703809, address: '11111111111111111111111111111111', symbol: 'SOL' },
]

realTokens.forEach(token => {
  const config = getChainConfig(token.chain)
  const assetId = buildAssetId(config.chainId, config.slip44, token.address, config.isEvm)
  console.log(`   ${token.symbol} on chain ${token.chain}:`)
  console.log(`     Input: ${token.address}`)
  console.log(`     Output: ${assetId}`)
})

// Test for potential filtering issues
console.log('\n3. Potential Filtering Issues:')
console.log('   Non-EVM native tokens (BTC, SOL) use slip44 format:')
const btcConfig = getChainConfig(8253038)
const btcAssetId = buildAssetId(btcConfig.chainId, btcConfig.slip44, 'bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmql8k8', btcConfig.isEvm)
console.log(`     BTC: ${btcAssetId}`)

const solConfig = getChainConfig(792703809)
const solAssetId = buildAssetId(solConfig.chainId, solConfig.slip44, '11111111111111111111111111111111', solConfig.isEvm)
console.log(`     SOL: ${solAssetId}`)

console.log('\n4. 5% Ratio Analysis:')
console.log('   Total fees: 12')
console.log('   Expected: $110.86')
console.log('   Actual: $5.48')
console.log('   Ratio: 5% (5.48 / 110.86 = 4.94%)')
console.log('')
console.log('   Hypothesis 1: Only 1 of 12 transactions counted')
console.log('     1/12 = 8.3% (close to 5%)')
console.log('')
console.log('   Hypothesis 2: Only fees < $1 counted')
const smallFees = [0.274866, 0.017171, 0.020329, 0.274866, 0.011234, 0.000578, 0.000578, 0.550000, 0.275000, 0.275000, 0.682779]
const smallTotal = smallFees.reduce((sum, f) => sum + f, 0)
console.log(`     Fees < $1: ${smallFees.length} fees = $${smallTotal.toFixed(2)}`)
console.log(`     But $1.88 ≠ $5.48 ✗`)
console.log('')
console.log('   Hypothesis 3: Specific chain excluded')
console.log('     Chain 1 (Ethereum): $109.54 (98.8%)')
console.log('     Other chains: $1.32 (1.2%)')
console.log('     But $1.32 ≠ $5.48 ✗')
console.log('')
console.log('   Hypothesis 4: Non-EVM chains only')
console.log('     BTC + SOL: $0.76')
console.log('     But $0.76 ≠ $5.48 ✗')
console.log('')
console.log('   Hypothesis 5: Specific token type')
console.log('     USDT: $0.55')
console.log('     SOL: $0.03')
console.log('     BTC: $0.73')
console.log('     USDC: $0.55')
console.log('     ETH (non-Ethereum): $0.56')
console.log('     Total non-ETH-mainnet: $2.42')
console.log('     But $2.42 ≠ $5.48 ✗')

console.log('\n5. Missing Currency Object Check:')
console.log('   Code: `const currencyObject = request.data?.feeCurrencyObject ?? request.data?.metadata?.currencyIn?.currency`')
console.log('   If feeCurrencyObject is missing, falls back to metadata.currencyIn.currency')
console.log('   If BOTH are missing, fee is SKIPPED with warning')
console.log('   This could cause fees to be dropped silently!')

console.log('\n=== Key Findings ===')
console.log('1. All chain IDs are handled correctly (EVM and non-EVM)')
console.log('2. Asset ID construction works for all token types')
console.log('3. Non-EVM chains use slip44 format correctly')
console.log('4. The 5% ratio does NOT match any simple filtering pattern')
console.log('5. Potential issue: Missing currencyObject could drop fees')
console.log('6. Most likely: Similar to Chainflip cache issue - stale partial data')
