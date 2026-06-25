export type UnchainedTokenTransfer = {
  from: string
  to: string
  value: string
  contract: string
  decimals: number
  name: string
  symbol: string
  type: string
}

export type UnchainedTx = {
  txid: string
  blockHeight: number
  timestamp: number
  status: number
  from: string
  to: string
  value: string
  inputData?: string
  tokenTransfers?: UnchainedTokenTransfer[]
}

export type UnchainedTxHistoryResponse = {
  pubkey: string
  cursor?: string
  txs: UnchainedTx[]
}
