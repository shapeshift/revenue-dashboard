export type ExplorerApiType = 'blockscout' | 'etherscan'

export type ChainConfig = {
  chainId: string
  network: string
  router: string
  treasury: string
  explorerUrl: string
  apiType: ExplorerApiType
  rpcUrl?: string
}

export type PortalEventData = {
  txHash: string
  timestamp: number
  inputToken: string
  inputAmount: string
  outputToken: string
  outputAmount: string
}

export type TokenTransfer = {
  token: string
  amount: string
  decimals: number
  symbol: string
}

export type EtherscanLogResult = {
  transactionHash: string
  blockNumber: string
  timeStamp: string
  topics: string[]
  data: string
}

export type EtherscanLogsResponse = {
  status: string
  message: string
  result: EtherscanLogResult[]
}

export type EtherscanTokenTxResult = {
  from: string
  to: string
  contractAddress: string
  tokenSymbol: string
  tokenDecimal: string
  value: string
}

export type EtherscanTokenTxResponse = {
  status: string
  message: string
  result: EtherscanTokenTxResult[]
}

export type BlockscoutTokenTransferResponse = {
  items: Array<{
    to: { hash: string }
    token: { address_hash: string; symbol: string }
    total: { value: string; decimals: string }
    token_type: string
  }>
}

export type DecodedPortalEvent = {
  inputToken: string
  inputAmount: string
  outputToken: string
  outputAmount: string
}

export type BlockNumberResponse = {
  status: string
  message: string
  result: string | { blockNumber: string }
}

export type RpcResponse<T> = {
  jsonrpc: string
  id: number
  result: T
  error?: { code: number; message: string }
}

export type RpcBlockResponse = {
  number: string
  timestamp: string
  hash: string
  parentHash: string
}
