import { assetDataService } from './src/utils/assetDataService'

await assetDataService.ensureLoadedAsync()

const assetId = 'cosmos:mayachain-mainnet-v1/slip44:931'
const asset = assetDataService.getAsset(assetId)
const decimals = await assetDataService.getAssetDecimals(assetId)

console.log('Asset ID:', assetId)
console.log('Asset found:', asset ? 'YES' : 'NO')
if (asset) {
  console.log('  Symbol:', asset.symbol)
  console.log('  Precision from asset:', asset.precision)
}
console.log('getAssetDecimals returned:', decimals)
console.log()
console.log('ISSUE: Should be 8, but returning:', decimals)
