export type AppFee = {
  recipient: string
  bps: string
  amount: string
  amountFormatted: string
  // only present on `actual` (settled) fees
  amountUsd?: string
}

export type CurrencyObject = {
  chainId: number
  address: string
  symbol: string
  name: string
  decimals: number
}

export type AppFees = {
  quoted: AppFee[]
  actual: AppFee[]
  currency: CurrencyObject
}

export type InTx = {
  chainId: number
  txHash: string
  timestamp: number
}

export type RequestData = {
  appFees?: AppFees
  inTxs?: InTx[]
}

export type RelayRequest = {
  id: string
  status: string
  user: string
  recipient: string
  createdAt: string
  updatedAt: string
  data: RequestData
}

export type RelayResponse = {
  requests: RelayRequest[]
  continuation?: string
}
