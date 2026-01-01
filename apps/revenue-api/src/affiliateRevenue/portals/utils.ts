import axios from 'axios'
import { decodeAbiParameters, zeroAddress } from 'viem'

import { getSlip44ForChain } from '../utils'

import {
  AFFILIATE_FEE_BPS,
  COINGECKO_API_BASE,
  COINGECKO_CHAINS,
  FEE_BPS_DENOMINATOR,
  PORTAL_EVENT_ABI,
} from './constants'
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

const priceCache: Record<string, { price: number | null; timestamp: number }> = {}
const PRICE_CACHE_TTL = 1000 * 60 * 5 // 5 minutes

export const getTokenPrice = async (chainId: string, tokenAddress: string): Promise<number | null> => {
  const cacheKey = `${chainId}:${tokenAddress.toLowerCase()}`
  const cached = priceCache[cacheKey]
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price
  }

  try {
    const networkId = chainId.split(':')[1]
    const chainConfig = COINGECKO_CHAINS[networkId]
    if (!chainConfig) return null

    const tokenLower = tokenAddress.toLowerCase()
    const isNative = tokenLower === zeroAddress

    if (isNative) {
      const { data } = await axios.get<Record<string, { usd: number }>>(`${COINGECKO_API_BASE}/simple/price`, {
        params: { vs_currencies: 'usd', ids: chainConfig.nativeCoinId },
      })
      const price = data[chainConfig.nativeCoinId]?.usd ?? null
      priceCache[cacheKey] = { price, timestamp: Date.now() }
      return price
    }

    const { data } = await axios.get<{ market_data?: { current_price?: { usd?: number } } }>(
      `${COINGECKO_API_BASE}/coins/${chainConfig.platform}/contract/${tokenLower}`
    )
    const price = data.market_data?.current_price?.usd ?? null
    priceCache[cacheKey] = { price, timestamp: Date.now() }
    return price
  } catch {
    priceCache[cacheKey] = { price: null, timestamp: Date.now() }
    return null
  }
}
