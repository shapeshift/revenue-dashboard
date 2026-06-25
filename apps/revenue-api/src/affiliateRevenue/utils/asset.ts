import { zeroAddress } from 'viem'

import {
  APTOS_CHAIN_ID,
  BITCOIN_CHAIN_ID,
  BITCOINCASH_CHAIN_ID,
  DOGECOIN_CHAIN_ID,
  MAYACHAIN_CHAIN_ID,
  NATIVE_TOKEN_ADDRESS,
  NEAR_CHAIN_ID,
  SLIP44,
  SOLANA_CHAIN_ID,
  STARKNET_CHAIN_ID,
  SUI_CHAIN_ID,
  THORCHAIN_CHAIN_ID,
  TON_CHAIN_ID,
  TRON_CHAIN_ID,
  ZCASH_CHAIN_ID,
} from '../constants'

// Native-asset slip44 by CAIP-2 chainId for the non-EVM chains we track. Every
// eip155 chain uses ETHEREUM (60) for asset-database compatibility.
const NATIVE_SLIP44_BY_CHAIN_ID: Record<string, number> = {
  [BITCOIN_CHAIN_ID]: SLIP44.BITCOIN,
  [BITCOINCASH_CHAIN_ID]: SLIP44.BITCOINCASH,
  [DOGECOIN_CHAIN_ID]: SLIP44.DOGECOIN,
  [ZCASH_CHAIN_ID]: SLIP44.ZCASH,
  [SOLANA_CHAIN_ID]: SLIP44.SOLANA,
  [TRON_CHAIN_ID]: SLIP44.TRON,
  [SUI_CHAIN_ID]: SLIP44.SUI,
  [THORCHAIN_CHAIN_ID]: SLIP44.THORCHAIN,
  [MAYACHAIN_CHAIN_ID]: SLIP44.MAYACHAIN,
  [NEAR_CHAIN_ID]: SLIP44.NEAR,
  [STARKNET_CHAIN_ID]: SLIP44.STARKNET,
  [TON_CHAIN_ID]: SLIP44.TON,
  [APTOS_CHAIN_ID]: SLIP44.APTOS,
}

// Solana native-asset markers (base58, case-sensitive): system program + wrapped SOL.
const SOLANA_NATIVE_SENTINELS = ['11111111111111111111111111111111', 'So11111111111111111111111111111111111111112']

export const getNativeSlip44ForChain = (chainId: string): number => {
  if (chainId.startsWith('eip155:')) return SLIP44.ETHEREUM
  const slip44 = NATIVE_SLIP44_BY_CHAIN_ID[chainId]
  if (slip44 === undefined) throw new Error(`No native slip44 mapping for chain: ${chainId}`)
  return slip44
}

// Backwards-compatible EVM-only accessor (throws for non-EVM chains).
export const getSlip44ForChain = (chainId: string): number => {
  if (!chainId.startsWith('eip155:')) throw new Error(`Not an EVM chain: ${chainId}`)
  return SLIP44.ETHEREUM
}

const isNativeToken = (namespace: string, tokenAddress: string): boolean => {
  if (namespace === 'eip155') {
    const address = tokenAddress.toLowerCase()
    return address === zeroAddress || address === NATIVE_TOKEN_ADDRESS
  }
  if (namespace === 'solana') return SOLANA_NATIVE_SENTINELS.includes(tokenAddress)
  return false
}

// Starknet addresses are 32 bytes but may arrive without leading zeros — normalize
// to lowercase, 0x-prefixed, padded to 64 hex chars.
const normalizeStarknetAddress = (address: string): string =>
  `0x${address.toLowerCase().replace('0x', '').padStart(64, '0')}`

/**
 * Build a CAIP-19 assetId for any tracked chain.
 *
 * Pass no token (or a native-asset sentinel) to get the chain's native asset
 * (`slip44:<n>`). Otherwise the token reference is namespaced per chain family:
 * eip155 -> erc20 (lowercased), solana/starknet -> token, near -> nep141.
 *
 * Throws for an unknown chain or for a token on a chain family without a token
 * namespace, so gaps surface instead of producing a silently-wrong assetId.
 */
export const buildAssetId = (chainId: string, tokenAddress?: string): string => {
  const namespace = chainId.split(':')[0]

  if (!tokenAddress || isNativeToken(namespace, tokenAddress)) {
    return `${chainId}/slip44:${getNativeSlip44ForChain(chainId)}`
  }

  switch (namespace) {
    case 'eip155':
      return `${chainId}/erc20:${tokenAddress.toLowerCase()}`
    case 'solana':
      return `${chainId}/token:${tokenAddress}`
    case 'starknet':
      return `${chainId}/token:${normalizeStarknetAddress(tokenAddress)}`
    case 'near':
      return `${chainId}/nep141:${tokenAddress}`
    default:
      throw new Error(`Cannot build token assetId for chain ${chainId} (token: ${tokenAddress})`)
  }
}
