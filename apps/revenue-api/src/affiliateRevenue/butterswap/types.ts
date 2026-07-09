export type ButterSwapTransaction = {
  orderId: string
  // Per-affiliate fee rates, e.g. "26:60|9:4" — `<affiliateId>:<bps>` pairs joined by "|".
  affiliates: string
  // Trade size normalized to USD with 6 decimals (independent of the source token).
  volume: string
  // Swap initiation time, epoch milliseconds.
  sourceTime: number
  raw: {
    // Settlement state on the MAP relay chain (1 = processed → affiliate fee collected).
    relayState: number
    sourceChainId: string | number
    destinationChainId: string | number
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
