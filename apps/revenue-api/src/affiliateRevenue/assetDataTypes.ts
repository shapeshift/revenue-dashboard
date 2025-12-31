export type StaticAsset = {
  assetId: string
  chainId: string
  precision: number
  symbol: string
  name: string
}

export type EncodedAsset = [
  assetIdx: number,
  name: string,
  precision: number,
  color: string,
  icon: string[],
  symbol: string,
  isPool: 0 | 1,
]

export type EncodedAssetData = {
  assetIdPrefixes: string[]
  encodedAssetIds: string[]
  encodedAssets: EncodedAsset[]
}
