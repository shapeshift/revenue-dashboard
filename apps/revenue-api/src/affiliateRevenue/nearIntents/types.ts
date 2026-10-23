export type ParseResult = { chainId: string; assetId: string }

export type NearIntentsTransaction = {
  originAsset: string
  destinationAsset: string
  depositAddress: string
  depositAddressAndMemo: string
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

// Bare array, newest first; page by passing the last item's depositAddressAndMemo as the cursor
export type TransactionsResponse = NearIntentsTransaction[]
