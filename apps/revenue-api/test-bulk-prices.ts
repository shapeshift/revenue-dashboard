// Test getBulkAssetPrices function with affected tokens
import { getBulkAssetPrices } from './src/affiliateRevenue/priceCache'

const AFFECTED_TOKENS = [
  'cosmos:thorchain-1/slip44:931', // RUNE
  'eip155:1/slip44:60', // ETH
  'eip155:1/erc20:0xc770eefad204b5180df6a14ee197d99d808ee52d', // FOX
  'eip155:1/erc20:0xaea46a60368a7bd060eec7df8cba43b7ef41ad85', // FET
  'eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
]

async function testBulkPrices() {
  console.log('=== Testing getBulkAssetPrices() ===\n')

  try {
    const prices = await getBulkAssetPrices(AFFECTED_TOKENS)

    console.log('Results:')
    for (const [assetId, price] of prices.entries()) {
      const symbol = assetId.includes('thorchain') ? 'RUNE' :
                     assetId.includes('slip44:60') ? 'ETH' :
                     assetId.includes('0xc770ee') ? 'FOX' :
                     assetId.includes('0xaea46a') ? 'FET' :
                     assetId.includes('0xdac17f') ? 'USDT' : 'UNKNOWN'

      console.log(`${symbol}: ${price !== null ? `$${price}` : 'NULL'}`)
      console.log(`  Asset ID: ${assetId}`)
      console.log()
    }

    // Summary
    const successCount = Array.from(prices.values()).filter(p => p !== null).length
    console.log(`\n=== Summary ===`)
    console.log(`Success: ${successCount}/${AFFECTED_TOKENS.length}`)
    console.log(`Failed: ${AFFECTED_TOKENS.length - successCount}/${AFFECTED_TOKENS.length}`)

  } catch (error) {
    console.error('Error testing bulk prices:', error)
  }
}

testBulkPrices()
