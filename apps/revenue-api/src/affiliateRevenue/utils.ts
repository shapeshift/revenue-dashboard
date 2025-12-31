import { SLIP44 } from './constants'

/**
 * Maps EVM chain IDs (numeric) to their native token's SLIP44 coin type
 */
export const EVM_CHAIN_TO_SLIP44: Record<number, number> = {
  1: SLIP44.ETHEREUM,
  10: SLIP44.ETHEREUM,
  56: SLIP44.BNB,
  100: SLIP44.ETHEREUM,
  137: SLIP44.MATIC,
  8453: SLIP44.ETHEREUM,
  42161: SLIP44.ETHEREUM,
  43114: SLIP44.AVAX,
}

/**
 * Gets the SLIP44 value for a chain's native token
 * Falls back to ETHEREUM (60) for unknown EVM chains
 */
export const getSlip44ForChain = (chainId: string): number => {
  if (!chainId.startsWith('eip155:')) {
    throw new Error(`Not an EVM chain: ${chainId}`)
  }

  const numericChainId = parseInt(chainId.split(':')[1])
  return EVM_CHAIN_TO_SLIP44[numericChainId] ?? SLIP44.ETHEREUM
}
