import type { Asset } from './types'

/**
 * Hardcoded asset entries that override or supplement the loaded asset DB.
 *
 * Used for assets that:
 * - Aren't in shapeshift/web's `generatedAssetData.json`, AND
 * - Aren't reliably resolvable via CoinGecko (e.g. unusual chains, bridged tokens)
 */
export const ASSET_OVERRIDES: Record<string, Asset> = {
  // MAP Protocol bridged USDT — verified on-chain to use 18 decimals (unusual for USDT)
  'eip155:22776/erc20:0x33daba9618a75a7aff103e53afe530fbacf4a3dd': {
    assetId: 'eip155:22776/erc20:0x33daba9618a75a7aff103e53afe530fbacf4a3dd',
    chainId: 'eip155:22776',
    symbol: 'USDT',
    precision: 18,
    name: 'Map Bridged USDT',
    color: '',
    icon: '',
  },

  // Expanse native EXP
  'eip155:2/slip44:60': {
    assetId: 'eip155:2/slip44:60',
    chainId: 'eip155:2',
    symbol: 'EXP',
    precision: 18,
    name: 'Expanse',
    color: '',
    icon: '',
  },
}
