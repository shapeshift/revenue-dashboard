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
}
