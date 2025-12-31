import type { EncodedAssetData, StaticAsset } from './assetDataTypes'

const decodeAssetId = (encodedAssetId: string, assetIdPrefixes: string[]): string => {
  const colonIndex = encodedAssetId.lastIndexOf(':')
  const prefixIdx = Number(encodedAssetId.substring(0, colonIndex))
  const assetReference = encodedAssetId.substring(colonIndex + 1)

  return assetIdPrefixes[prefixIdx] + ':' + assetReference
}

const extractChainIdFromAssetId = (assetId: string): string => {
  const slashIndex = assetId.indexOf('/')
  return assetId.substring(0, slashIndex)
}

export const decodeAssetData = (encodedAssetData: EncodedAssetData): Record<string, StaticAsset> => {
  const { assetIdPrefixes, encodedAssetIds, encodedAssets } = encodedAssetData

  const assetData: Record<string, StaticAsset> = {}

  encodedAssetIds.forEach((encodedAssetId, idx) => {
    const assetId = decodeAssetId(encodedAssetId, assetIdPrefixes)
    const encodedAsset = encodedAssets[idx]

    if (!encodedAsset) return

    const chainId = extractChainIdFromAssetId(assetId)

    assetData[assetId] = {
      assetId,
      chainId,
      precision: encodedAsset[2],
      symbol: encodedAsset[5],
      name: encodedAsset[1],
    }
  })

  return assetData
}
