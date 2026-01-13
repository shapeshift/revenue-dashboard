export interface SignatureInfo {
  signature: string
  slot: number
  err: unknown
  memo: string | null
  blockTime: number | null
  confirmationStatus?: string
}

export interface TokenBalance {
  accountIndex: number
  mint: string
  uiTokenAmount: {
    uiAmount: number | null
    decimals: number
    amount: string
    uiAmountString: string
  }
  owner: string
  programId: string
}

export interface SolanaTransaction {
  slot: number
  blockTime: number | null
  meta: {
    err: unknown
    fee: number
    preTokenBalances: TokenBalance[]
    postTokenBalances: TokenBalance[]
  }
}
