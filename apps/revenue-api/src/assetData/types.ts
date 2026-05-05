export type Asset = {
  assetId: string
  chainId: string
  symbol: string
  name: string
  precision: number
  color: string
  icon: string
  icons?: string[]
  isPool?: boolean
}
