import { readFile } from 'node:fs/promises'
import { decodeAssetData } from './src/assetData/decodeAssetData'

const cacheFile = '/tmp/shapeshift-revenue-asset-cache.json'

try {
  const cacheContent = await readFile(cacheFile, 'utf-8')
  const cache = JSON.parse(cacheContent)

  console.log('Decoding asset data...')
  const { assetData } = decodeAssetData(cache.data)

  const cacaoAssetId = 'cosmos:mayachain-mainnet-v1/slip44:931'
  const cacao = assetData[cacaoAssetId]

  if (cacao) {
    console.log('\n=== CACAO in Asset Database ===')
    console.log('Asset ID:', cacao.assetId)
    console.log('Symbol:', cacao.symbol)
    console.log('Name:', cacao.name)
    console.log('Precision:', cacao.precision, '← THIS IS THE SOURCE OF 10 DECIMALS')
    console.log('Chain ID:', cacao.chainId)
  } else {
    console.log('CACAO not found in asset database')
  }

  // Also check if there are any other mayachain assets
  console.log('\n=== All MayaChain Assets ===')
  Object.values(assetData).forEach((asset: any) => {
    if (asset.chainId === 'cosmos:mayachain-mainnet-v1') {
      console.log(`${asset.symbol}: ${asset.precision} decimals (${asset.assetId})`)
    }
  })
} catch (error) {
  console.error('Error:', error)
}
