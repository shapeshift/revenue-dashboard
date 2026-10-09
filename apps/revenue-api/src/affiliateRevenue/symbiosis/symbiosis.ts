import type { Hex } from 'viem'
import { decodeEventLog, decodeFunctionResult, encodeFunctionData, erc20Abi, padHex, toEventSelector } from 'viem'

import { assetDataService } from '../../assetData/AssetDataService'
import { isRetryableError, withRetry } from '../../utils/retry'
import { getCachedBlockTimestamp, saveCachedBlockTimestamp } from '../cache'
import { registerCoingeckoId } from '../coingeckoMappingService'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { buildAssetId, createRpcCaller, getCachedFees } from '../utils'

import {
  FEE_COLLECTED_EVENT,
  STOKEN_COINGECKO_IDS,
  SYMBIOSIS_CHAIN,
  SYMBIOSIS_PARTNER_ADDRESS,
  SYMBIOSIS_PARTNER_FEE_COLLECTOR,
} from './constants'

type Log = { topics: [Hex, ...Hex[]]; data: Hex; blockNumber: Hex; transactionHash: Hex }
type Block = { timestamp: Hex }
type FeeCollected = { token: string; fee: bigint; blockNumber: number; txHash: string }

const LOOKUP_CONCURRENCY = 10

const rpcCall = createRpcCaller(SYMBIOSIS_CHAIN.rpcUrl)

// The replica answers rate limits and outages as HTTP errors, which the default predicate doesn't retry
const isRetryableRpcError = (error: unknown): boolean =>
  isRetryableError(error) || (error instanceof Error && /RPC HTTP error: (429|5\d\d)/.test(error.message))

const retryingRpcCall = <T>(context: string, method: string, params: unknown[]): Promise<T> =>
  withRetry(context, () => rpcCall<T>(method, params), { shouldRetry: isRetryableRpcError })

const decodeFeeCollected = (log: Log): FeeCollected => {
  const { args } = decodeEventLog({ abi: [FEE_COLLECTED_EVENT], topics: log.topics, data: log.data })

  return {
    token: args.token.toLowerCase(),
    fee: args.fee,
    blockNumber: Number(log.blockNumber),
    txHash: log.transactionHash,
  }
}

// Strip the synthetic prefix: sWETH -> WETH, sUSDbC -> USDbC
const getStokenCoingeckoId = (symbol: string): string | undefined => STOKEN_COINGECKO_IDS[symbol.replace(/^s/, '')]

const ethCall = (context: string, to: string, data: Hex): Promise<Hex> =>
  retryingRpcCall<Hex>(context, 'eth_call', [{ to, data }, 'latest'])

const readSymbol = async (token: string): Promise<string> =>
  decodeFunctionResult({
    abi: erc20Abi,
    functionName: 'symbol',
    data: await ethCall('symbiosis/symbol', token, encodeFunctionData({ abi: erc20Abi, functionName: 'symbol' })),
  })

const readDecimals = async (token: string): Promise<number> =>
  decodeFunctionResult({
    abi: erc20Abi,
    functionName: 'decimals',
    data: await ethCall('symbiosis/decimals', token, encodeFunctionData({ abi: erc20Abi, functionName: 'decimals' })),
  })

const resolvedTokens = new Set<string>()

// sTokens live only on the Symbiosis chain, so the asset DB has never heard of them
const registerStoken = async (token: string): Promise<void> => {
  const assetId = buildAssetId(SYMBIOSIS_CHAIN.chainId, token)
  if (resolvedTokens.has(assetId)) return

  const [symbol, decimals] = await Promise.all([readSymbol(token), readDecimals(token)])

  assetDataService.registerAsset({
    assetId,
    chainId: SYMBIOSIS_CHAIN.chainId,
    symbol,
    name: `Symbiosis ${symbol}`,
    precision: decimals,
    color: '',
    icon: '',
  })

  const coingeckoId = getStokenCoingeckoId(symbol)
  if (coingeckoId) {
    registerCoingeckoId(assetId, coingeckoId)
  } else {
    console.warn(`[symbiosis] No price mapping for ${symbol} (${assetId}) - add to STOKEN_COINGECKO_IDS`)
  }

  resolvedTokens.add(assetId)
}

const getBlockTimestamp = async (blockNumber: number): Promise<number> => {
  const cached = getCachedBlockTimestamp(SYMBIOSIS_CHAIN.chainId, blockNumber)
  if (cached !== undefined) return cached

  const block = await retryingRpcCall<Block>('symbiosis/block', 'eth_getBlockByNumber', [
    `0x${blockNumber.toString(16)}`,
    false,
  ])
  const timestamp = Number(BigInt(block.timestamp))
  saveCachedBlockTimestamp(SYMBIOSIS_CHAIN.chainId, blockNumber, timestamp)

  return timestamp
}

// One lookup per distinct block, a few at a time, so a batch of fees doesn't burst the public replica
const getBlockTimestamps = async (blockNumbers: number[]): Promise<Map<number, number>> => {
  const timestamps = new Map<number, number>()

  for (let i = 0; i < blockNumbers.length; i += LOOKUP_CONCURRENCY) {
    await Promise.all(
      blockNumbers.slice(i, i + LOOKUP_CONCURRENCY).map(async block => {
        timestamps.set(block, await getBlockTimestamp(block))
      })
    )
  }

  return timestamps
}

// One unbounded query: the topic filter narrows the collector's few hundred lifetime events to ours
const fetchPartnerFees = async (): Promise<Fees[]> => {
  const logs = await retryingRpcCall<Log[]>('symbiosis/getLogs', 'eth_getLogs', [
    {
      address: SYMBIOSIS_PARTNER_FEE_COLLECTOR,
      fromBlock: '0x0',
      toBlock: 'latest',
      topics: [toEventSelector(FEE_COLLECTED_EVENT), padHex(SYMBIOSIS_PARTNER_ADDRESS, { size: 32 })],
    },
  ])

  const events = logs.map(decodeFeeCollected).filter(event => event.fee > 0n)

  const [timestamps] = await Promise.all([
    getBlockTimestamps([...new Set(events.map(event => event.blockNumber))]),
    ...[...new Set(events.map(event => event.token))].map(registerStoken),
  ])

  return events.map(event => ({
    chainId: SYMBIOSIS_CHAIN.chainId,
    assetId: buildAssetId(SYMBIOSIS_CHAIN.chainId, event.token),
    service: 'symbiosis' as const,
    txHash: event.txHash,
    timestamp: timestamps.get(event.blockNumber)!,
    amount: event.fee.toString(),
  }))
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  // Fetched lazily and at most once per run, so a fully cached window costs no RPC
  let allFees: Promise<Fees[]> | undefined
  const fetchRange = async (start: number, end: number) =>
    (await (allFees ??= fetchPartnerFees())).filter(fee => fee.timestamp >= start && fee.timestamp <= end)

  const { fees } = await getCachedFees('symbiosis', SYMBIOSIS_CHAIN.chainId, startTimestamp, endTimestamp, fetchRange)
  const sorted = fees.sort((a, b) => b.timestamp - a.timestamp)

  console.log(`[symbiosis] Total: ${sorted.length} fees in ${Date.now() - startTime}ms`)

  return enrichFeesWithUsdPrices(sorted)
}
