export type ParseResult = { chainId: string; assetId: string }

export type NearIntentsTransaction = {
  originAsset: string
  destinationAsset: string
  depositAddress: string
  recipient: string
  status: string
  createdAt: string
  createdAtTimestamp: number
  intentHashes: string
  referral: string
  amountInFormatted: string
  amountOutFormatted: string
  appFees: Array<{
    fee: number
    recipient: string
  }>
  nearTxHashes: string[]
  originChainTxHashes: string[]
  destinationChainTxHashes: string[]
  amountIn: string
  amountInUsd: string
  amountOut: string
  amountOutUsd: string
  refundTo: string
}

export type TransactionsResponse = {
  data: NearIntentsTransaction[]
  totalPages: number
  page: number
  perPage: number
  total: number
  nextPage?: number
  prevPage?: number
}
