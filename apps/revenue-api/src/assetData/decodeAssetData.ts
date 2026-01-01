import { FIELDS } from './constants'
import type { EncodedAssetData, FieldToType, StaticAsset } from './types'

const assertUnreachable = (x: never): never => {
  throw Error(`unhandled case: ${x}`)
}

const decodeAssetId = (encodedAssetId: string, assetIdPrefixes: string[]) => {
  const colonIndex = encodedAssetId.lastIndexOf(':')
  const prefixIdx = Number(encodedAssetId.substring(0, colonIndex))
  const assetReference = encodedAssetId.substring(colonIndex + 1)

  return assetIdPrefixes[prefixIdx] + ':' + assetReference
}

const fromAssetId = (assetId: string): { chainId: string; assetReference: string } => {
  const slashIndex = assetId.indexOf('/')
  const chainId = assetId.substring(0, slashIndex)
  const assetReference = assetId.substring(slashIndex + 1)
  return { chainId, assetReference }
}

export const decodeAssetData = (encodedAssetData: EncodedAssetData) => {
  const { assetIdPrefixes, encodedAssetIds, encodedAssets } = encodedAssetData

  const sortedAssetIds: string[] = encodedAssetIds.map(encodedAssetId =>
    decodeAssetId(encodedAssetId, assetIdPrefixes)
  )

  const assetData = encodedAssets.reduce<Record<string, StaticAsset>>((acc, encodedAsset, idx) => {
    const assetId = sortedAssetIds[idx]
    if (!assetId) return acc
    const { chainId } = fromAssetId(assetId)

    const asset: StaticAsset = {
      assetId,
      chainId,
      symbol: '',
      name: '',
      precision: 0,
      color: '',
      icon: '',
    }

    FIELDS.forEach((field, fieldIdx) => {
      const value = encodedAsset[fieldIdx]

      switch (field) {
        case 'icon': {
          const iconOrIcons = value as FieldToType[typeof field]
          if (iconOrIcons.length === 1 && iconOrIcons[0]) {
            asset.icon = iconOrIcons[0]
          } else if (iconOrIcons.length > 1 && iconOrIcons[0]) {
            asset.icons = iconOrIcons
            asset.icon = iconOrIcons[0]
          }
          break
        }
        case 'name':
          asset.name = value as FieldToType[typeof field]
          break
        case 'precision':
          asset.precision = value as FieldToType[typeof field]
          break
        case 'color':
          asset.color = value as FieldToType[typeof field]
          break
        case 'symbol':
          asset.symbol = value as FieldToType[typeof field]
          break
        case 'isPool': {
          const isPool = value as FieldToType[typeof field]
          if (isPool) {
            asset.isPool = true
          }
          break
        }
        case 'assetIdx':
          break
        default:
          assertUnreachable(field)
      }
    })

    acc[assetId] = asset
    return acc
  }, {})

  return {
    assetData,
    sortedAssetIds,
  }
}
