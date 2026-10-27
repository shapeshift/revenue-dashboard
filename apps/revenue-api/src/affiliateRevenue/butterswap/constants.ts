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

// Same-chain swaps are missing from Butter's API; the router pays our cut straight to a receiver wallet
export const SAME_CHAIN_ROUTERS = [
  '0xee0319cf0bca5d09333f9f6277743e8de31bd69a', // Router V3.1
  '0xee030ec6f4307411607e55acd08e628ae6655b86', // Router V3.0
]

// Active periods (unix seconds), padded around each receiver's first and last observed fee
export const SAME_CHAIN_FEE_RECEIVERS: { address: string; from: number; until?: number }[] = [
  { address: '0x35339070f178dc4119732982c23f5a8d88d3f8a3', from: 1754006400, until: 1777593600 }, // 2025-08-01 → 2026-05-01
  { address: '0xf5aa59151be6515c4ca68a0282cf68b3ea4846fc', from: 1775001600 }, // 2026-04-01 →
]

export const SAME_CHAIN_CHAIN_IDS = [
  ETHEREUM_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  BSC_CHAIN_ID,
  GNOSIS_CHAIN_ID,
  POLYGON_CHAIN_ID,
  BASE_CHAIN_ID,
  ARBITRUM_CHAIN_ID,
  AVALANCHE_CHAIN_ID,
]
