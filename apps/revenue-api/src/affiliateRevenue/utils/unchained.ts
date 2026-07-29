import {
  ARBITRUM_CHAIN_ID,
  AVALANCHE_CHAIN_ID,
  BASE_CHAIN_ID,
  BSC_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  GNOSIS_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  POLYGON_CHAIN_ID,
} from '../constants'

export const UNCHAINED_PAGE_SIZE = 100

const UNCHAINED_HOST_BY_CHAIN_ID: Record<string, string> = {
  [ETHEREUM_CHAIN_ID]: 'https://api.ethereum.shapeshift.com',
  [ARBITRUM_CHAIN_ID]: 'https://api.arbitrum.shapeshift.com',
  [BASE_CHAIN_ID]: 'https://api.base.shapeshift.com',
  [AVALANCHE_CHAIN_ID]: 'https://api.avalanche.shapeshift.com',
  [POLYGON_CHAIN_ID]: 'https://api.polygon.shapeshift.com',
  [GNOSIS_CHAIN_ID]: 'https://api.gnosis.shapeshift.com',
  [OPTIMISM_CHAIN_ID]: 'https://api.optimism.shapeshift.com',
  [BSC_CHAIN_ID]: 'https://api.bnbsmartchain.shapeshift.com',
}

export const hasUnchainedHost = (chainId: string): boolean => chainId in UNCHAINED_HOST_BY_CHAIN_ID

export const getUnchainedBaseUrl = (chainId: string): string => {
  const url = UNCHAINED_HOST_BY_CHAIN_ID[chainId]
  if (!url) throw new Error(`[unchained] No host configured for chain ${chainId}`)
  return url
}

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

export type UnchainedInternalTx = {
  from: string
  to: string
  value: string
}

export type UnchainedTx = {
  txid: string
  blockHeight: number
  timestamp: number
  status: number
  from: string
  to: string | null
  value: string
  inputData?: string
  tokenTransfers?: UnchainedTokenTransfer[]
  internalTxs?: UnchainedInternalTx[]
}

export type UnchainedTxHistoryResponse = {
  pubkey: string
  cursor?: string
  txs: UnchainedTx[]
}
