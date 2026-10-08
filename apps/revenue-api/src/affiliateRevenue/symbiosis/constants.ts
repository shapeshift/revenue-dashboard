import { SYMBIOSIS_CHAIN_ID } from '../constants'

/**
 * Symbiosis pays our partner fee on its own host chain, not on the swap's chains.
 *
 * shapeshift/web's SymbiosisSwapper sends `partnerAddress` on every quote. The API
 * then inserts a `collectFee` call into the cross-chain transit, so on the host-chain
 * leg the General Fee Collector takes 0.60% of the sToken passing through and books it
 * to our partner. Nothing moves to a treasury: fees accumulate in the collector per
 * (partner, token) until `claimFee` is called from the partner address.
 *
 * Revenue is therefore the `FeeCollected` events on the collector for our partner.
 * The fee lands in whichever sToken the route transited (sUSDC, sWETH, ...), each a
 * 1:1 representation of a mainnet asset, which is how they are priced.
 */
export const SYMBIOSIS_RPC_URL = 'https://mainnet-replica.symbiosis.finance'
export const SYMBIOSIS_PARTNER_FEE_COLLECTOR = '0x783EE304C54d4658f59EAefb73b32D37ee466e23'

// The partner Symbiosis activated for us (same key as the Monad/HyperEVM treasury)
export const SYMBIOSIS_PARTNER_ADDRESS = '0xF5AA59151bE6515C4Ca68A0282CF68B3eA4846fC'

// keccak256('FeeCollected(address,address,uint256,uint256)') - partner and token are indexed
export const FEE_COLLECTED_TOPIC = '0x205442d60b70af1203d43cab62352c3b69b94f091be32fe683198057282b5c92'

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
