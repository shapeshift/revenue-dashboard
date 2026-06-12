import bs58 from 'bs58'

import { getSlip44ForChain } from '../utils'

import { HOT_BRIDGE_CHAINS, HOT_BRIDGE_TOKENS, NEAR_INTENTS_TO_CHAIN_ID, SLIP44_BY_NETWORK } from './constants'
import { getRegistryToken } from './tokenRegistry'
import type { ParseResult } from './types'

// NEP245 parsing constants
const SUPPORTED_NEP245_VERSION = 'v2_1'
const NEP245_CONTRACT_IDENTIFIER = 'omni.hot.tg'
const ETHEREUM_ADDRESS_LENGTH = 20 // bytes

export const resolveChainId = (network: string): string | undefined => {
  const chainId = NEAR_INTENTS_TO_CHAIN_ID[network]
  if (!chainId) {
    console.warn(`[nearIntents] Unknown network '${network}' - add to NEAR_INTENTS_TO_CHAIN_ID`)
  }
  return chainId
}

export const buildAssetId = (chainId: string, network: string, tokenAddress?: string): string => {
  if (chainId.startsWith('unknown:')) {
    return tokenAddress ? `${chainId}/unknown:${tokenAddress}` : `${chainId}/native`
  }

  if (tokenAddress) {
    switch (chainId.split(':')[0]) {
      case 'eip155':
        return `${chainId}/erc20:${tokenAddress.toLowerCase()}`
      case 'solana':
      case 'starknet':
        return `${chainId}/token:${tokenAddress}`
      case 'tron':
        return `${chainId}/trc20:${tokenAddress}`
      case 'ton':
        return `${chainId}/jetton:${tokenAddress}`
      case 'sui':
        return `${chainId}/coin:${tokenAddress}`
      case 'near':
        return `${chainId}/nep141:${tokenAddress}`
      default:
        console.warn(`[nearIntents] No asset namespace for ${chainId} - using unknown for token ${tokenAddress}`)
        return `${chainId}/unknown:${tokenAddress}`
    }
  }

  const slip44 = chainId.startsWith('eip155:') ? getSlip44ForChain(chainId) : (SLIP44_BY_NETWORK[network] ?? 0)
  return `${chainId}/slip44:${slip44}`
}

// Decodes Base58-encoded 20-byte Ethereum address from NEP245 suffix
const decodeNEP245TokenSuffix = (suffix: string): string | null => {
  try {
    // Decode base58 to get raw bytes
    const decoded = bs58.decode(suffix)

    // Ethereum addresses are exactly 20 bytes (160 bits)
    if (decoded.length !== ETHEREUM_ADDRESS_LENGTH) {
      console.warn(
        `[nearIntents] Invalid decoded address length: expected ${ETHEREUM_ADDRESS_LENGTH} bytes, got ${decoded.length} for suffix ${suffix}`
      )
      return null
    }

    // Convert bytes to hex string with 0x prefix
    const hexAddress = '0x' + Buffer.from(decoded).toString('hex').toLowerCase()

    // Validate hex address format (0x + 40 hex chars)
    if (!/^0x[a-f0-9]{40}$/.test(hexAddress)) {
      console.warn(`[nearIntents] Invalid hex address format: ${hexAddress}`)
      return null
    }

    return hexAddress
  } catch (error) {
    console.warn(`[nearIntents] Failed to decode NEP245 suffix ${suffix}:`, error)
    return null
  }
}

export const parseNearIntentsAsset = (asset: string): ParseResult => {
  // The official token registry is the source of truth — it resolves the asset to
  // its underlying blockchain and canonical contract address. The heuristics below
  // only run for assets missing from the registry (e.g. delisted tokens)
  const registryToken = getRegistryToken(asset)
  if (registryToken) {
    const { blockchain, contractAddress } = registryToken
    const chainId = resolveChainId(blockchain) ?? `unknown:${blockchain}`
    // Natives have no contractAddress, except 1cs ids which use a 'native' standard
    // segment with the placeholder address 'coin'
    const isNative = !contractAddress || /^1cs_v\d+:[^:]+:native:/.test(asset)
    return { chainId, assetId: buildAssetId(chainId, blockchain, isNative ? undefined : contractAddress) }
  }

  const nep141Match = asset.match(/^nep141:(.+)\.omft\.near$/)
  if (nep141Match) {
    const assetPart = nep141Match[1]

    const tokenMatch = assetPart.match(/^([a-z]+)-(0x)?([a-f0-9]+)$/i)
    if (tokenMatch) {
      const network = tokenMatch[1]
      const tokenAddress = `0x${tokenMatch[3]}`
      const chainId = resolveChainId(network) ?? `unknown:${network}`
      return { chainId, assetId: buildAssetId(chainId, network, tokenAddress) }
    }

    const network = assetPart
    const chainId = resolveChainId(network) ?? `unknown:${network}`
    return { chainId, assetId: buildAssetId(chainId, network) }
  }

  const nep141NativeMatch = asset.match(/^nep141:(.+\.near)$/)
  if (nep141NativeMatch) {
    const contractId = nep141NativeMatch[1]
    const chainId = resolveChainId('near') ?? 'near:mainnet'
    return { chainId, assetId: `${chainId}/nep141:${contractId}` }
  }

  // NEP245 format: nep245:VERSION.CONTRACT:CHAIN_SUFFIX
  // Example: nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g
  // Native tokens may use an empty suffix (`:1117_`) or an all-1s suffix (`:56_111...`).
  const nep245Pattern = new RegExp(`^nep245:(v\\d+_\\d+)\\.${NEP245_CONTRACT_IDENTIFIER}:(\\d+)_(.*)$`)
  const nep245Match = asset.match(nep245Pattern)
  if (nep245Match) {
    const version = nep245Match[1]
    const hotChainNumber = nep245Match[2]
    const suffix = nep245Match[3] ?? ''

    // Warn if we see a version we haven't tested
    if (version !== SUPPORTED_NEP245_VERSION) {
      console.warn(
        `[nearIntents] Untested NEP245 version '${version}' detected (expected '${SUPPORTED_NEP245_VERSION}'). Parser may need updates.`
      )
    }

    // Native token conventions: empty suffix (`:1117_`) or all-1s (`:56_111...`).
    // The all-1s pattern follows Solana (32 ones) and other blockchains' native-token convention.
    const isNativeToken = suffix === '' || /^1+$/.test(suffix)

    const hotChain = HOT_BRIDGE_CHAINS[hotChainNumber]
    if (!hotChain) {
      console.warn(`[nearIntents] Unknown HOT bridge chain '${hotChainNumber}' - add to HOT_BRIDGE_CHAINS`)
      const chainId = `unknown:${hotChainNumber}`
      return {
        chainId,
        assetId: isNativeToken ? `${chainId}/native` : `${chainId}/unknown:${suffix}`,
      }
    }

    const { chainId, slip44 } = hotChain

    if (isNativeToken) {
      return { chainId, assetId: `${chainId}/slip44:${slip44}` }
    }

    // EVM suffixes are base58-encoded ERC20 addresses
    if (chainId.startsWith('eip155:')) {
      const tokenAddress = decodeNEP245TokenSuffix(suffix)

      if (tokenAddress) {
        return { chainId, assetId: `${chainId}/erc20:${tokenAddress}` }
      }

      console.warn(`[nearIntents] Could not decode token suffix: ${suffix}`)
      return { chainId, assetId: `${chainId}/unknown:${suffix}` }
    }

    // Non-EVM chains use chain-specific suffix encodings — resolve via explicit mapping
    const assetId = HOT_BRIDGE_TOKENS[`${hotChainNumber}_${suffix}`]
    if (assetId) return { chainId, assetId }

    console.warn(
      `[nearIntents] Unknown HOT bridge token '${hotChainNumber}_${suffix}' on ${chainId} - add to HOT_BRIDGE_TOKENS`
    )
    return { chainId, assetId: `${chainId}/unknown:${suffix}` }
  }

  // 1CS (1-Click Swap) v1 native format: 1cs_v1:NETWORK:native:coin
  // Example: 1cs_v1:btc:native:coin
  const oneClickSwapNativeMatch = asset.match(/^1cs_v\d+:([a-z0-9]+):native:coin$/i)
  if (oneClickSwapNativeMatch) {
    const network = oneClickSwapNativeMatch[1]
    const chainId = resolveChainId(network) ?? `unknown:${network}`
    return { chainId, assetId: buildAssetId(chainId, network) }
  }

  const prefix = asset.split(':')[0] ?? 'unknown'
  console.warn(`[nearIntents] Unrecognized asset format: ${asset} - update parser`)
  return { chainId: `unknown:${prefix}`, assetId: `unknown:${prefix}/unknown` }
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
