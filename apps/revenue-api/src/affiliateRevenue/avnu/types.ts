export interface StarknetEvent {
  from_address: string
  keys: string[]
  data: string[]
  block_number: number
  block_hash: string
  transaction_hash: string
}

export interface StarknetEventsResponse {
  events: StarknetEvent[]
  continuation_token?: string
}

export interface StarknetBlock {
  timestamp: number
}
