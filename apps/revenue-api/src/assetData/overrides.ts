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

  // Wrapped NEAR (NEP-141) — not in shapeshift/web's generated asset data
  'near:mainnet/nep141:wrap.near': {
    assetId: 'near:mainnet/nep141:wrap.near',
    chainId: 'near:mainnet',
    symbol: 'wNEAR',
    precision: 24,
    name: 'Wrapped NEAR',
    color: '',
    icon: '',
  },

  // Pudgy Penguins (PENGU) bridged from Solana to NEAR via Omni Deposit (.omdep.near)
  'near:mainnet/nep141:sol-0xaad74c68eecfc9f8c5bdcea614f6167048c795ef.omdep.near': {
    assetId: 'near:mainnet/nep141:sol-0xaad74c68eecfc9f8c5bdcea614f6167048c795ef.omdep.near',
    chainId: 'near:mainnet',
    symbol: 'PENGU',
    precision: 6,
    name: 'Pudgy Penguins',
    color: '',
    icon: '',
  },

  // StarkGate: STRK Token
  'starknet:SN_MAIN/token:0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d': {
    assetId: 'starknet:SN_MAIN/token:0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    chainId: 'starknet:SN_MAIN',
    symbol: 'STRK',
    precision: 18,
    name: 'Starknet Token',
    color: '',
    icon: '',
  },

  // Native APT on Aptos
  'aptos:1/slip44:637': {
    assetId: 'aptos:1/slip44:637',
    chainId: 'aptos:1',
    symbol: 'APT',
    precision: 8,
    name: 'Aptos',
    color: '',
    icon: '',
  },

  // DOT on Ethereum — 10 decimals on-chain; the CoinGecko fallback would
  // wrongly report 18 (the decimals of polkadot's canonical contract)
  'eip155:1/erc20:0x196c20da81fbc324ecdf55501e95ce9f0bd84d14': {
    assetId: 'eip155:1/erc20:0x196c20da81fbc324ecdf55501e95ce9f0bd84d14',
    chainId: 'eip155:1',
    symbol: 'DOT',
    precision: 10,
    name: 'Polkadot',
    color: '',
    icon: '',
  },
}
