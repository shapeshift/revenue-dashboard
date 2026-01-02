import type { StaticAsset } from './types'

/**
 * Manual asset definitions for tokens not yet in the main asset database.
 * Used as fallback when asset is missing from the GitHub data source.
 *
 * Add tokens here when:
 * 1. They generate revenue but aren't in the main database
 * 2. You have verified the correct decimal count
 * 3. The token is legitimate (not a scam/spam token)
 */
export const MANUAL_ASSETS: Record<string, StaticAsset> = {
  // MAP Protocol USDT (ButterSwap revenue token)
  // Bridged USDT on MAP Protocol - verified on-chain: 18 decimals (unusual for USDT but correct)
  'eip155:22776/erc20:0x33daba9618a75a7aff103e53afe530fbacf4a3dd': {
    assetId: 'eip155:22776/erc20:0x33daba9618a75a7aff103e53afe530fbacf4a3dd',
    chainId: 'eip155:22776',
    symbol: 'USDT',
    name: 'Map Bridged USDT',
    precision: 18,
    color: '#26A17B',
    icon: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
  },

  // Avalanche C-Chain token - decimal count unverified, using 18 as default
  // TODO: Verify actual decimal count if this token generates significant revenue
  'eip155:43114/erc20:0x230c4ad11510360ad0db564a889c33559a959487': {
    assetId: 'eip155:43114/erc20:0x230c4ad11510360ad0db564a889c33559a959487',
    chainId: 'eip155:43114',
    symbol: 'UNKNOWN',
    name: 'Unknown Avalanche Token',
    precision: 18,
    color: '#CCCCCC',
    icon: '',
  },
}
