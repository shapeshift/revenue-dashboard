import {
  APTOS_CHAIN_ID,
  ARBITRUM_CHAIN_ID,
  AVALANCHE_CHAIN_ID,
  BASE_CHAIN_ID,
  BITCOIN_CHAIN_ID,
  BITCOINCASH_CHAIN_ID,
  BSC_CHAIN_ID,
  DOGECOIN_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  GNOSIS_CHAIN_ID,
  MONAD_CHAIN_ID,
  NEAR_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  PLASMA_CHAIN_ID,
  POLYGON_CHAIN_ID,
  SLIP44,
  SOLANA_CHAIN_ID,
  STARKNET_CHAIN_ID,
  SUI_CHAIN_ID,
  TON_CHAIN_ID,
  TRON_CHAIN_ID,
  ZCASH_CHAIN_ID,
} from '../constants'

export const NEAR_INTENTS_API_KEY = process.env.NEAR_INTENTS_API_KEY
if (!NEAR_INTENTS_API_KEY) throw new Error('NEAR_INTENTS_API_KEY env var not set')

export const DAO_NEAR_TREASURY_ADDRESSES = [
  'f471d0b0f90593d85125f38aaf5458748d6f23fd5b437b844d293d8e87557070',
  'shapeshifttokenomics.sputnik-dao.near',
]

export const NEAR_INTENTS_TO_CHAIN_ID: Record<string, string> = {
  eth: ETHEREUM_CHAIN_ID,
  arb: ARBITRUM_CHAIN_ID,
  base: BASE_CHAIN_ID,
  gnosis: GNOSIS_CHAIN_ID,
  bsc: BSC_CHAIN_ID,
  pol: POLYGON_CHAIN_ID,
  avax: AVALANCHE_CHAIN_ID,
  op: OPTIMISM_CHAIN_ID,
  btc: BITCOIN_CHAIN_ID,
  bch: BITCOINCASH_CHAIN_ID,
  doge: DOGECOIN_CHAIN_ID,
  zec: ZCASH_CHAIN_ID,
  sol: SOLANA_CHAIN_ID,
  tron: TRON_CHAIN_ID,
  sui: SUI_CHAIN_ID,
  near: NEAR_CHAIN_ID,
  starknet: STARKNET_CHAIN_ID,
  monad: MONAD_CHAIN_ID,
  aptos: APTOS_CHAIN_ID,
  ton: TON_CHAIN_ID,
  plasma: PLASMA_CHAIN_ID,
}

export const SLIP44_BY_NETWORK: Record<string, number> = {
  btc: SLIP44.BITCOIN,
  bch: SLIP44.BITCOINCASH,
  doge: SLIP44.DOGECOIN,
  zec: SLIP44.ZCASH,
  near: SLIP44.NEAR,
  sol: SLIP44.SOLANA,
  tron: SLIP44.TRON,
  sui: SLIP44.SUI,
  starknet: SLIP44.STARKNET,
  aptos: SLIP44.APTOS,
  ton: SLIP44.TON,
}

// HOT bridge (omni.hot.tg) chain numbers → chain ids and slip44
export const HOT_BRIDGE_CHAINS: Record<string, { chainId: string; slip44: number }> = {
  '1': { chainId: ETHEREUM_CHAIN_ID, slip44: SLIP44.ETHEREUM },
  '10': { chainId: OPTIMISM_CHAIN_ID, slip44: SLIP44.ETHEREUM },
  '56': { chainId: BSC_CHAIN_ID, slip44: SLIP44.ETHEREUM },
  '100': { chainId: GNOSIS_CHAIN_ID, slip44: SLIP44.ETHEREUM },
  '137': { chainId: POLYGON_CHAIN_ID, slip44: SLIP44.ETHEREUM },
  '143': { chainId: MONAD_CHAIN_ID, slip44: SLIP44.ETHEREUM },
  '8453': { chainId: BASE_CHAIN_ID, slip44: SLIP44.ETHEREUM },
  '9745': { chainId: PLASMA_CHAIN_ID, slip44: SLIP44.ETHEREUM },
  '42161': { chainId: ARBITRUM_CHAIN_ID, slip44: SLIP44.ETHEREUM },
  '43114': { chainId: AVALANCHE_CHAIN_ID, slip44: SLIP44.ETHEREUM },
  '1117': { chainId: TON_CHAIN_ID, slip44: SLIP44.TON },
}

// Known HOT bridge token ids (`<chainNumber>_<suffix>`) → assetIds. Non-EVM
// suffixes encode chain-specific values that can't be decoded to canonical token
// ids offline (e.g. TON suffixes decode to the bridge's jetton *wallet*, not the
// jetton master) — map known ones explicitly
export const HOT_BRIDGE_TOKENS: Record<string, string> = {
  // USD₮ on TON
  '1117_3tsdfyziyc7EJbP2aULWSKU4toBaAcN4FdTgfm5W1mC4ouR': `${TON_CHAIN_ID}/jetton:EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs`,
}
