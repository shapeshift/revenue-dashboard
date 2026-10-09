import { parseAbiItem } from 'viem'

import { SYMBIOSIS_CHAIN_ID } from '../constants'

// Symbiosis host chain: partner fees are collected here on the transit leg, not on the swap's chains
export const SYMBIOSIS_RPC_URL = 'https://mainnet-replica.symbiosis.finance'

// Takes 0.6% of the transiting sToken on every quote web tags with our partnerAddress; nothing moves
// to a treasury, fees sit in the collector per (partner, token) until claimFee is called from it
export const SYMBIOSIS_PARTNER_FEE_COLLECTOR = '0x783EE304C54d4658f59EAefb73b32D37ee466e23'

// The partner Symbiosis activated for us (same key as the Monad/HyperEVM treasury)
export const SYMBIOSIS_PARTNER_ADDRESS = '0xF5AA59151bE6515C4Ca68A0282CF68B3eA4846fC'

export const FEE_COLLECTED_EVENT = parseAbiItem(
  'event FeeCollected(address indexed partner, address indexed token, uint256 amount, uint256 fee)'
)

export const SYMBIOSIS_CHAIN = { chainId: SYMBIOSIS_CHAIN_ID, rpcUrl: SYMBIOSIS_RPC_URL }

// sTokens are 1:1 wrappers named after the asset they represent, so price them as that asset
export const STOKEN_COINGECKO_IDS: Record<string, string> = {
  WETH: 'ethereum',
  ETH: 'ethereum',
  WBTC: 'bitcoin',
  BTC: 'bitcoin',
  USDC: 'usd-coin',
  USDbC: 'usd-coin',
  USDT: 'tether',
  USDG: 'global-dollar',
  BNB: 'binancecoin',
  SIS: 'symbiosis-finance',
}
