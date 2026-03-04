export type MidgardCoin = {
  amount: string
  asset: string
}

export type MidgardTx = {
  address: string
  coins: MidgardCoin[]
  txID: string
  affiliate?: boolean
  height?: string
}

export type MidgardAction = {
  date: string // nanoseconds as string
  height: string
  in: MidgardTx[]
  out: MidgardTx[]
  metadata: {
    swap?: {
      affiliateAddress: string
      affiliateFee: string // bps as string e.g. "55"
      inPriceUSD: string
      outPriceUSD: string
      memo: string
    }
  }
  pools: string[]
  status: string
  type: string
}

export type MidgardActionsResponse = {
  actions: MidgardAction[]
  meta: { count?: string }
}

export type RunePriceItem = {
  startTime: string // unix seconds as string
  endTime: string
  runePriceUSD: string // Int64(e8) — divide by 1e8 for actual USD price
}

export type RunePriceHistory = {
  meta: {
    startTime: string
    endTime: string
    startRunePriceUSD: string
    endRunePriceUSD: string
  }
  intervals: RunePriceItem[]
}
