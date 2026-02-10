import { assetDataService } from './src/utils/assetDataService'

await assetDataService.ensureLoadedAsync()

const assetId = 'cosmos:mayachain-mainnet-v1/slip44:931'

// Check what asset is found
const asset = assetDataService.getAsset(assetId)
console.log('Asset found:', asset)

// Check decimals
const decimals = await assetDataService.getAssetDecimals(assetId)
console.log('\n✓ CACAO decimals:', decimals)

if (decimals === 10) {
  console.log('✅ CORRECT! CACAO is using 10 decimals (1e10) as per MayaChain spec')
} else {
  console.log(`❌ WRONG! CACAO should be 10 decimals, not ${decimals}`)
}

// Show what the revenue would be with sample data
const sampleRawAmount = '2234481157062' // Real amount from Jan 31, 2026
const cacaoPrice = 0.09226 // Current price

const normalizedAmount = Number(sampleRawAmount) / 10 ** decimals
const usdValue = normalizedAmount * cacaoPrice

console.log(`\nSample calculation with real Jan 31 data:`)
console.log(`Raw amount: ${sampleRawAmount}`)
console.log(`Normalized: ${normalizedAmount.toFixed(4)} CACAO`)
console.log(`USD value: $${usdValue.toFixed(2)}`)
