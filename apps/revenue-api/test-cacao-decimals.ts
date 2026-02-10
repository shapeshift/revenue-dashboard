import { assetDataService } from './src/utils/assetDataService'

await assetDataService.ensureLoadedAsync()

// Check if CACAO exists in main database (not manualAssets)
const asset = assetDataService.getAsset('cosmos:mayachain-mainnet-v1/slip44:931')
console.log('Asset from main DB:', asset)

// Check decimals without CoinGecko fallback
const decimalsNoCG = await assetDataService.getAssetDecimals(
  'cosmos:mayachain-mainnet-v1/slip44:931',
  false
)
console.log('Decimals (no CoinGecko fallback):', decimalsNoCG)

// Check decimals with CoinGecko fallback
const decimalsWithCG = await assetDataService.getAssetDecimals('cosmos:mayachain-mainnet-v1/slip44:931', true)
console.log('Decimals (with CoinGecko fallback):', decimalsWithCG)
