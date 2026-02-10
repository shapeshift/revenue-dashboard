// Test mapping service load timing
import * as coingeckoMappingService from './src/affiliateRevenue/coingeckoMappingService'

const AFFECTED_TOKENS = [
  'cosmos:thorchain-1/slip44:931', // RUNE
  'eip155:1/slip44:60', // ETH
  'eip155:1/erc20:0xc770eefad204b5180df6a14ee197d99d808ee52d', // FOX
  'eip155:1/erc20:0xaea46a60368a7bd060eec7df8cba43b7ef41ad85', // FET
  'eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
]

async function testMappingLoadTiming() {
  console.log('=== Testing Mapping Load Timing ===\n')

  // Test 1: Check if mappings loaded
  console.log('Test 1: Check if mappings are loaded')
  const isLoaded = coingeckoMappingService.isLoaded()
  console.log(`isLoaded(): ${isLoaded}`)
  console.log()

  // Test 2: Try to get mapping BEFORE ensureLoadedAsync
  console.log('Test 2: Get mapping BEFORE ensureLoadedAsync()')
  for (const assetId of AFFECTED_TOKENS) {
    const cgId = coingeckoMappingService.getCoingeckoId(assetId)
    const symbol = assetId.includes('thorchain') ? 'RUNE' :
                   assetId.includes('slip44:60') ? 'ETH' :
                   assetId.includes('0xc770ee') ? 'FOX' :
                   assetId.includes('0xaea46a') ? 'FET' : 'USDT'
    console.log(`${symbol}: ${cgId || 'UNDEFINED'}`)
  }
  console.log()

  // Test 3: Load mappings
  console.log('Test 3: Loading mappings...')
  await coingeckoMappingService.ensureLoadedAsync()
  console.log('Mappings loaded!')
  console.log()

  // Test 4: Try again AFTER loading
  console.log('Test 4: Get mapping AFTER ensureLoadedAsync()')
  for (const assetId of AFFECTED_TOKENS) {
    const cgId = coingeckoMappingService.getCoingeckoId(assetId)
    const symbol = assetId.includes('thorchain') ? 'RUNE' :
                   assetId.includes('slip44:60') ? 'ETH' :
                   assetId.includes('0xc770ee') ? 'FOX' :
                   assetId.includes('0xaea46a') ? 'FET' : 'USDT'
    console.log(`${symbol}: ${cgId || 'UNDEFINED'}`)
  }
  console.log()

  // Test 5: Verify isLoaded state
  console.log('Test 5: Verify loaded state')
  const isLoadedNow = coingeckoMappingService.isLoaded()
  console.log(`isLoaded(): ${isLoadedNow}`)
  console.log()

  console.log('=== CONCLUSION ===')
  console.log('The getBulkAssetPrices() function ALWAYS calls ensureLoadedAsync() first (line 15)')
  console.log('This guarantees mappings are loaded before price lookup')
  console.log('So timing/race conditions are NOT the issue')
}

testMappingLoadTiming()
