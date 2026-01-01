import { createHash } from 'crypto'

import { encodeAbiParameters, parseAbiParameters } from 'viem'

import type { Fees } from '..'
import { getDateRange, getDateStartTimestamp } from '../cache'
import { assetDataService } from '../../utils/assetDataService'

import {
  API_SUCCESS_CODE,
  BUTTERSWAP_AFFILIATE_ID,
  BUTTERSWAP_CONTRACT,
  FALLBACK_TOKENS,
  GET_TOTAL_BALANCE_SELECTOR,
  HEX_PREFIX_LENGTH,
  HEX_RADIX,
  MAP_CHAIN_ID,
  MAP_USDT_ADDRESS,
  TOKEN_CACHE_TTL_MS,
  TOKEN_LIST_API,
  UINT256_HEX_LENGTH,
} from './constants'
import type { TokenListResponse } from './types'
import { estimateBlockFromTimestamp, rpcCall } from './utils'

let cachedTokens: string[] | null = null
let tokensCachedAt = 0

const fetchTokenList = async (): Promise<string[]> => {
  const now = Date.now()
  if (cachedTokens && now - tokensCachedAt < TOKEN_CACHE_TTL_MS) {
    return cachedTokens
  }

  try {
    const response = await fetch(TOKEN_LIST_API)
    const data: TokenListResponse = await response.json()

    if (data.errno === API_SUCCESS_CODE && data.data?.items?.length > 0) {
      cachedTokens = data.data.items.map(t => t.address.toLowerCase())
      tokensCachedAt = now
      return cachedTokens
    }
  } catch {
    // Fall through to return fallback tokens
  }

  return FALLBACK_TOKENS
}

const getBlockNumber = async (): Promise<number> => {
  const result = await rpcCall<string>('eth_blockNumber', [])
  return parseInt(result, HEX_RADIX)
}

const getTotalBalance = async (blockNumber: number, tokens: string[]): Promise<bigint> => {
  const params = encodeAbiParameters(parseAbiParameters('uint256, address[], address'), [
    BigInt(BUTTERSWAP_AFFILIATE_ID),
    tokens as `0x${string}`[],
    MAP_USDT_ADDRESS as `0x${string}`,
  ])

  const data = GET_TOTAL_BALANCE_SELECTOR + params.slice(HEX_PREFIX_LENGTH)
  const blockHex = `0x${blockNumber.toString(HEX_RADIX)}`

  const result = await rpcCall<string>('eth_call', [{ to: BUTTERSWAP_CONTRACT, data }, blockHex])

  return BigInt(result.slice(0, UINT256_HEX_LENGTH))
}

const generateSyntheticTxHash = (service: string, date: string): string => {
  return '0x' + createHash('sha256').update(`${service}-${date}`).digest('hex')
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Array<Fees>> => {
  await assetDataService.ensureLoadedAsync()

  const startTime = Date.now()
  const tokens = await fetchTokenList()

  const currentBlock = await getBlockNumber()
  const now = Math.floor(Date.now() / 1000)

  const startBlock = estimateBlockFromTimestamp(currentBlock, now, startTimestamp)
  const endBlock = estimateBlockFromTimestamp(currentBlock, now, endTimestamp)

  const [balanceAtStart, balanceAtEnd] = await Promise.all([
    getTotalBalance(startBlock, tokens),
    getTotalBalance(endBlock, tokens),
  ]).catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to query ButterSwap balance: ${message}`)
  })

  const feesForPeriod = balanceAtEnd - balanceAtStart

  if (feesForPeriod <= BigInt(0)) {
    const duration = Date.now() - startTime
    console.log(`[butterswap] Total: 0 fees in ${duration}ms`)
    return []
  }

  const dates = getDateRange(startTimestamp, endTimestamp)
  const numDays = dates.length
  const assetId = `${MAP_CHAIN_ID}/erc20:${MAP_USDT_ADDRESS}`

  const feesPerDay = feesForPeriod / BigInt(numDays)
  const decimals = assetDataService.getAssetDecimals(assetId)
  const feesPerDayUsd = Number(feesPerDay) / 10 ** decimals

  const fees = dates.map(date => ({
    service: 'butterswap' as const,
    amount: feesPerDay.toString(),
    amountUsd: feesPerDayUsd.toString(),
    chainId: MAP_CHAIN_ID,
    assetId,
    timestamp: getDateStartTimestamp(date),
    txHash: generateSyntheticTxHash('butterswap', date),
  }))

  const duration = Date.now() - startTime
  console.log(`[butterswap] Total: ${fees.length} fees in ${duration}ms`)

  return fees
}
