import { toEventSelector, zeroAddress } from 'viem'

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

export const BUTTERSWAP_AFFILIATE_ID = 26
export const MAP_RELAY_CHAIN_ID = '22776'
export const USD_DECIMALS = 6

export const TRANSACTIONS_API = 'https://affiliate.butterswap.io/api/transactions'
export const PAGE_SIZE = 100
export const API_SUCCESS_CODE = 0
export const REQUEST_TIMEOUT_MS = 15000

export const SAME_CHAIN_ROUTERS = new Set(
  ['0xEE0319cF0BCa5d09333f9F6277743E8De31bD69A', '0xEE030ec6F4307411607E55aCD08e628Ae6655B86'].map(a => a.toLowerCase())
)

export const SAME_CHAIN_FEE_RECEIVERS = new Set(
  ['0x35339070f178dc4119732982c23f5a8d88d3f8a3', '0xf5aa59151be6515c4ca68a0282cf68b3ea4846fc'].map(a => a.toLowerCase())
)

export const ERC20_TRANSFER_TOPIC = toEventSelector('Transfer(address,address,uint256)')

// EIP-7528 native-token sentinel (viem has no constant for it; zeroAddress covers the other case).
const NATIVE_TOKEN_EIP7528 = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
export const isNativeAddress = (address: string | undefined): boolean => {
  const a = (address ?? '').toLowerCase()
  return !a || a === zeroAddress || a === NATIVE_TOKEN_EIP7528
}

export const EVM_CHAIN_BY_SOURCE_CHAIN_ID: Record<string, { chainId: string; url: string }> = {
  '1': { chainId: ETHEREUM_CHAIN_ID, url: 'https://api.ethereum.shapeshift.com' },
  '10': { chainId: OPTIMISM_CHAIN_ID, url: 'https://api.optimism.shapeshift.com' },
  '56': { chainId: BSC_CHAIN_ID, url: 'https://api.bnbsmartchain.shapeshift.com' },
  '100': { chainId: GNOSIS_CHAIN_ID, url: 'https://api.gnosis.shapeshift.com' },
  '137': { chainId: POLYGON_CHAIN_ID, url: 'https://api.polygon.shapeshift.com' },
  '8453': { chainId: BASE_CHAIN_ID, url: 'https://api.base.shapeshift.com' },
  '42161': { chainId: ARBITRUM_CHAIN_ID, url: 'https://api.arbitrum.shapeshift.com' },
  '43114': { chainId: AVALANCHE_CHAIN_ID, url: 'https://api.avalanche.shapeshift.com' },
}
