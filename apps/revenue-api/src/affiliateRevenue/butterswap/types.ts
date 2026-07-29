// Token as reported inside an order — `chainId` is numeric (22776 for the MAP relay chain).
export type ButterSwapToken = {
  chainId: number | string
  address: string
  decimals: number
  symbol: string
  name?: string
}

// One row per affiliate per order, written when the MAP relay tx charges the fee.
export type AffiliateFee = {
  affiliateId: string | number
  // Relay tx that charged the fee (same hash as the order's `relayHash`).
  hash: string
  orderId: string
  // Fee token — a MAP-chain mapped token (mUSDC/mUSDT/mETH/mBTC), always 18 decimals.
  token: ButterSwapToken
  // Bridged amount the rate was applied to, in `token` base units.
  amount: string
  // Fee rate in bps. Informational only: it doesn't reproduce `fee` exactly on every order.
  rate: string | number
  // The fee actually charged, in `token` base units.
  fee: string
  // USD price of `token` at fee time, 6 decimals.
  price: string
  completeTime: string
}

export type ButterSwapTransaction = {
  orderId: string
  // Per-affiliate fee rates, e.g. "26:60|9:4" — `<affiliateId>:<bps>` pairs joined by "|".
  affiliate?: string
  affiliateDict?: string
  // Same rates, structured.
  affiliates?: Array<{ affiliateId: number; rate: number; name?: string }>
  // Per-affiliate fees actually charged — the source of truth for what we earned.
  affiliateFees?: AffiliateFee[]
  // Trade size normalized to USD with 6 decimals (independent of the source token).
  volume: string
  // Swap initiation time, ISO-8601 (mirrors `raw.sourceTime`).
  sendTime: string
  raw: {
    // Settlement state on the MAP relay chain. NOT a reliable "fee charged" signal — 11 of 457
    // orders report -1 while the swap completed (state 8) and the fee row exists.
    relayState: number
    sourceChainId: string | number
    destinationChainId: string | number
    sourceTime: string
    sourceHash: string
    sourceTokenAddress: string
    sourceAmount: string
  }
}

export type TransactionsResponse = {
  errno: number
  message: string
  data: {
    items: ButterSwapTransaction[]
    total: number
    pages: number
    page: number
    size: number
  }
}

// Normalized value transfer (from/to/value, optional token contract). Native fees come from the
// unchained tx `internalTxs`; ERC20 fees are decoded from receipt logs into this same shape.
export type Transfer = { from?: string; to?: string; value?: string; contract?: string }

export type EvmLog = { address: string; topics: string[]; data: string }
export type TransactionReceipt = { logs: EvmLog[] }
export type UnchainedTx = { internalTxs?: Transfer[] }
