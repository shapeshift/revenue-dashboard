import { decodeAbiParameters, zeroAddress } from 'viem'

import { getSlip44ForChain } from '../utils'

import { AFFILIATE_FEE_BPS, FEE_BPS_DENOMINATOR, PORTAL_EVENT_ABI } from './constants'
import type { DecodedPortalEvent } from './types'

export const decodePortalEventData = (data: string): DecodedPortalEvent | null => {
  if (!data || data.length < 258) return null

  try {
    const decoded = decodeAbiParameters(PORTAL_EVENT_ABI, data as `0x${string}`)
    return {
      inputToken: decoded[0],
      inputAmount: decoded[1].toString(),
      outputToken: decoded[2],
      outputAmount: decoded[3].toString(),
    }
  } catch {
    return null
  }
}

export const calculateFallbackFee = (inputAmount: string): string => {
  const amount = BigInt(inputAmount)
  const fee = (amount * BigInt(AFFILIATE_FEE_BPS)) / BigInt(FEE_BPS_DENOMINATOR)
  return fee.toString()
}

export const buildAssetId = (chainId: string, tokenAddress: string): string => {
  const tokenLower = tokenAddress.toLowerCase()
  const isNative = tokenLower === zeroAddress
  const slip44 = isNative ? getSlip44ForChain(chainId) : undefined
  return isNative ? `${chainId}/slip44:${slip44}` : `${chainId}/erc20:${tokenLower}`
}
