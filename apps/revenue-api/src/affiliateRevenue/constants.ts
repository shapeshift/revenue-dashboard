export const NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
export const DAO_TREASURY_ETHEREUM = '0x90a48d5cf7343b08da12e067680b4c6dbfe551be'
export const DAO_TREASURY_OPTIMISM = '0x6268d07327f4fb7380732dc6d63d95F88c0E083b'
export const DAO_TREASURY_AVALANCHE = '0x74d63F31C2335b5b3BA7ad2812357672b2624cEd'
export const DAO_TREASURY_POLYGON = '0xB5F944600785724e31Edb90F9DFa16dBF01Af000'
export const DAO_TREASURY_GNOSIS = '0xb0E3175341794D1dc8E5F02a02F9D26989EbedB3'
export const DAO_TREASURY_BSC = '0x8b92b1698b57bEDF2142297e9397875ADBb2297E'
export const DAO_TREASURY_ARBITRUM = '0x38276553F8fbf2A027D901F8be45f00373d8Dd48'
export const DAO_TREASURY_BASE = '0x9c9aA90363630d4ab1D9dbF416cc3BBC8d3Ed502'
export const DAO_TREASURY_MONAD = '0xF5AA59151bE6515C4Ca68A0282CF68B3eA4846fC'
export const DAO_TREASURY_HYPEREVM = '0xF5AA59151bE6515C4Ca68A0282CF68B3eA4846fC'

// CAIP-2 Chain IDs (non-EVM chains that need explicit mapping)
export const BITCOIN_CHAIN_ID = 'bip122:000000000019d6689c085ae165831e93'
export const BITCOINCASH_CHAIN_ID = 'bip122:000000000000000000651ef99cb9fcbe'
export const DOGECOIN_CHAIN_ID = 'bip122:00000000001a91e3dace36e2be3bf030'
export const ZCASH_CHAIN_ID = 'bip122:00040fe8ec8471911baa1db1266ea15d'
export const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
export const TRON_CHAIN_ID = 'tron:0x2b6653dc'
export const SUI_CHAIN_ID = 'sui:35834a8a'
export const THORCHAIN_CHAIN_ID = 'cosmos:thorchain-1'
export const MAYACHAIN_CHAIN_ID = 'cosmos:mayachain-mainnet-v1'
export const NEAR_CHAIN_ID = 'near:mainnet'
export const STARKNET_CHAIN_ID = 'starknet:SN_MAIN'
export const TON_CHAIN_ID = 'ton:mainnet'
export const APTOS_CHAIN_ID = 'aptos:1'

// EVM Chain IDs (CAIP-2 format)
export const ETHEREUM_CHAIN_ID = 'eip155:1'
export const OPTIMISM_CHAIN_ID = 'eip155:10'
export const BSC_CHAIN_ID = 'eip155:56'
export const GNOSIS_CHAIN_ID = 'eip155:100'
export const POLYGON_CHAIN_ID = 'eip155:137'
export const BASE_CHAIN_ID = 'eip155:8453'
export const MAP_CHAIN_ID = 'eip155:22776'
export const ARBITRUM_CHAIN_ID = 'eip155:42161'
export const AVALANCHE_CHAIN_ID = 'eip155:43114'
export const MONAD_CHAIN_ID = 'eip155:143'
export const HYPEREVM_CHAIN_ID = 'eip155:999'
export const PLASMA_CHAIN_ID = 'eip155:9745'

// Slip44 coin type values for native assets
export const SLIP44 = {
  BITCOIN: 0,
  BITCOINCASH: 145,
  DOGECOIN: 3,
  ETHEREUM: 60,
  ZCASH: 133,
  TRON: 195,
  NEAR: 397,
  SOLANA: 501,
  BNB: 714,
  SUI: 784,
  MAYACHAIN: 931,
  THORCHAIN: 931,
  MATIC: 966,
  AVAX: 9000,
  STARKNET: 9004,
  TON: 607,
  APTOS: 637,
} as const

// Affiliate fee BPS — changed from 55 to 60 on Feb 18 2026 (ShapeShift PR #11920)
export const AFFILIATE_FEE_BPS = 60
export const AFFILIATE_FEE_BPS_LEGACY = 55
export const FEE_BPS_DENOMINATOR = 10000
export const BPS_CHANGE_TIMESTAMP = 1771372800 // 2026-02-18T00:00:00Z

export const getAffiliateBps = (timestamp?: number): number => {
  if (timestamp === undefined) return AFFILIATE_FEE_BPS
  return timestamp >= BPS_CHANGE_TIMESTAMP ? AFFILIATE_FEE_BPS : AFFILIATE_FEE_BPS_LEGACY
}

export const getAffiliateFeeRate = (timestamp?: number): number => {
  return getAffiliateBps(timestamp) / FEE_BPS_DENOMINATOR
}

// Portals.fi - PortalsMulticall sends fee tokens to treasury after each swap
export const PORTALS_MULTICALL = '0x89c30E3Af15D210736b2918fbD655c9842Fd74f7'

// CoinGecko platform IDs and native coin IDs by CAIP-2 chain id
// Used for price lookups and token metadata
export const COINGECKO_CHAINS: Record<string, { platform: string; nativeCoinId: string }> = {
  'eip155:1': { platform: 'ethereum', nativeCoinId: 'ethereum' },
  'eip155:10': { platform: 'optimistic-ethereum', nativeCoinId: 'ethereum' },
  'eip155:56': { platform: 'binance-smart-chain', nativeCoinId: 'binancecoin' },
  'eip155:100': { platform: 'xdai', nativeCoinId: 'xdai' },
  'eip155:137': { platform: 'polygon-pos', nativeCoinId: 'matic-network' },
  'eip155:143': { platform: 'monad', nativeCoinId: 'monad' },
  'eip155:999': { platform: 'hyperevm', nativeCoinId: 'hyperliquid' },
  'eip155:4217': { platform: 'tempo', nativeCoinId: '' },
  'eip155:8453': { platform: 'base', nativeCoinId: 'ethereum' },
  'eip155:9745': { platform: 'plasma', nativeCoinId: 'plasma' },
  'eip155:42161': { platform: 'arbitrum-one', nativeCoinId: 'ethereum' },
  'eip155:43114': { platform: 'avalanche', nativeCoinId: 'avalanche-2' },
  'eip155:22776': { platform: 'map-protocol', nativeCoinId: 'marcopolo' },
}
