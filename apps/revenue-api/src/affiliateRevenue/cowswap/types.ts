// Blockscout internal transaction response types

export interface BlockscoutAddress {
  hash: string
}

export interface BlockscoutInternalTransaction {
  from: BlockscoutAddress
  to: BlockscoutAddress
  value: string
  timestamp: string
  transaction_hash: string
  success: boolean
  type: string
}

export interface BlockscoutInternalTxResponse {
  items: BlockscoutInternalTransaction[]
  next_page_params: {
    block_number: number
    index: number
    items_count: number
    transaction_index: number
  } | null
}
