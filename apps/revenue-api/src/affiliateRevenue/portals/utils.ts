import { decodeAbiParameters } from 'viem'

import { FEE_BPS_DENOMINATOR, getAffiliateBps } from '../constants'

import { PORTAL_EVENT_ABI } from './constants'
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

export const calculateFallbackFee = (inputAmount: string, timestamp?: number): string => {
  const amount = BigInt(inputAmount)
  const fee = (amount * BigInt(getAffiliateBps(timestamp))) / BigInt(FEE_BPS_DENOMINATOR)
  return fee.toString()
}

export { buildAssetId } from '../utils'
