import { SLIP44 } from './constants'

/**
 * Gets the SLIP44 value for an EVM chain's native token.
 *
 * All EVM chains use slip44:60 (ETHEREUM) in the asset database for compatibility,
 * regardless of their actual SLIP-44 coin type (e.g., BNB is 714, AVAX is 9000, MATIC is 966).
 */
export const getSlip44ForChain = (chainId: string): number => {
  if (!chainId.startsWith('eip155:')) {
    throw new Error(`Not an EVM chain: ${chainId}`)
  }

  return SLIP44.ETHEREUM
}

// Converts amount to string, handling cases where 0x API returns it as a number
export const safeAmountToString = (amount: string | number | undefined): string => {
  if (amount === undefined || amount === null) return ''
  return typeof amount === 'string' ? amount : String(amount)
}
