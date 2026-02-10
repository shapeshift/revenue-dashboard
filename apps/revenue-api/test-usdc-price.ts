// Simulate enrichment for USDC
const usdcFee = {
  assetId: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  amount: '45712641', // USDC wei (6 decimals)
  amountUsd: '45.712641946700000000000000000000',
  originalUsdValue: undefined
}

// What enrichment does:
// 1. Moves amountUsd to originalUsdValue
const originalUsdValue = usdcFee.amountUsd
console.log("Original USD value:", originalUsdValue)

// 2. Calculates new USD value with current price
const currentUsdcPrice = 0.9999 // Hypothetical: USDC slightly off peg
const decimals = 6
const amountDecimal = Number(usdcFee.amount) / 10 ** decimals
console.log("Amount decimal:", amountDecimal)

const calculatedUsd = (amountDecimal * currentUsdcPrice).toString()
console.log("Calculated USD (with price):", calculatedUsd)

// Expected: ~45.71, but what if price lookup fails?
const priceIsNull = null
if (priceIsNull === null) {
  console.log("Price lookup failed - using originalUsdValue")
  console.log("Final amountUsd:", originalUsdValue)
} else {
  console.log("Final amountUsd:", calculatedUsd)
}
