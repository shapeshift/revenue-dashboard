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
      affiliateFee: string // bps as string e.g. "60"
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
  meta: { nextPageToken?: string; prevPageToken?: string }
}

export type DepthHistoryItem = {
  startTime: string // unix seconds as string
  endTime: string
  assetPrice: string // asset price in CACAO
  assetPriceUSD: string
}

export type DepthHistory = {
  meta: {
    startTime: string
    endTime: string
  }
  intervals: DepthHistoryItem[]
}
