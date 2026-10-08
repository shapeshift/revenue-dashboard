import { assetDataService } from '../../assetData/AssetDataService'
import { withRetry } from '../../utils/retry'
import { getCachedBlockTimestamp, saveCachedBlockTimestamp } from '../cache'
import { registerCoingeckoId } from '../coingeckoMappingService'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { buildAssetId, createRpcCaller, getCachedFees } from '../utils'

import {
  FEE_COLLECTED_TOPIC,
  STOKEN_COINGECKO_IDS,
  SYMBIOSIS_CHAIN,
  SYMBIOSIS_PARTNER_ADDRESS,
  SYMBIOSIS_PARTNER_FEE_COLLECTOR,
} from './constants'

type Log = {
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
}

type Block = { timestamp: string }

export type FeeCollected = {
  partner: string
  token: string
  amount: bigint
  fee: bigint
  blockNumber: number
  txHash: string
}

const rpcCall = createRpcCaller(SYMBIOSIS_CHAIN.rpcUrl)

const padAddress = (address: string): string => `0x${address.toLowerCase().replace('0x', '').padStart(64, '0')}`

export const decodeFeeCollected = (log: Log): FeeCollected => {
  const data = log.data.replace('0x', '')

  return {
    partner: `0x${log.topics[1].slice(-40)}`,
    token: `0x${log.topics[2].slice(-40)}`,
    amount: BigInt(`0x${data.slice(0, 64)}`),
    fee: BigInt(`0x${data.slice(64, 128)}`),
    blockNumber: Number(log.blockNumber),
    txHash: log.transactionHash,
  }
}

// Strip the synthetic prefix: sWETH -> WETH, sUSDbC -> USDbC
export const getStokenCoingeckoId = (symbol: string): string | undefined =>
  STOKEN_COINGECKO_IDS[symbol.replace(/^s/, '')]

const decodeString = (hex: string): string => {
  const bytes = Buffer.from(hex.replace('0x', ''), 'hex')
  // ABI string: offset word, length word, then the bytes
  const length = Number(BigInt(`0x${bytes.subarray(32, 64).toString('hex')}`))
  return bytes.subarray(64, 64 + length).toString('utf8')
}

const resolvedTokens = new Set<string>()

// sTokens live only on the Symbiosis chain, so the asset DB has never heard of them
const registerStoken = async (token: string): Promise<void> => {
  const assetId = buildAssetId(SYMBIOSIS_CHAIN.chainId, token)
  if (resolvedTokens.has(assetId)) return

  const [symbolHex, decimalsHex] = await Promise.all([
    withRetry('symbiosis/symbol', () => rpcCall<string>('eth_call', [{ to: token, data: '0x95d89b41' }, 'latest'])),
    withRetry('symbiosis/decimals', () => rpcCall<string>('eth_call', [{ to: token, data: '0x313ce567' }, 'latest'])),
  ])
  const symbol = decodeString(symbolHex)

  assetDataService.registerAsset({
    assetId,
    chainId: SYMBIOSIS_CHAIN.chainId,
    symbol,
    name: `Symbiosis ${symbol}`,
    precision: Number(BigInt(decimalsHex)),
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

  const block = await withRetry('symbiosis/block', () =>
    rpcCall<Block>('eth_getBlockByNumber', [`0x${blockNumber.toString(16)}`, false])
  )
  const timestamp = Number(BigInt(block.timestamp))
  saveCachedBlockTimestamp(SYMBIOSIS_CHAIN.chainId, blockNumber, timestamp)

  return timestamp
}

// The collector has seen a few hundred fee events in its lifetime and the topic filter narrows
// that to ours, so one unbounded query is cheaper than mapping timestamps to a block range
const fetchPartnerFees = async (): Promise<Fees[]> => {
  const logs = await withRetry('symbiosis/getLogs', () =>
    rpcCall<Log[]>('eth_getLogs', [
      {
        address: SYMBIOSIS_PARTNER_FEE_COLLECTOR,
        fromBlock: '0x0',
        toBlock: 'latest',
        topics: [FEE_COLLECTED_TOPIC, padAddress(SYMBIOSIS_PARTNER_ADDRESS)],
      },
    ])
  )

  const events = logs.map(decodeFeeCollected).filter(event => event.fee > 0n)

  await Promise.all([...new Set(events.map(event => event.token))].map(registerStoken))

  return Promise.all(
    events.map(async event => ({
      chainId: SYMBIOSIS_CHAIN.chainId,
      assetId: buildAssetId(SYMBIOSIS_CHAIN.chainId, event.token),
      service: 'symbiosis' as const,
      txHash: event.txHash,
      timestamp: await getBlockTimestamp(event.blockNumber),
      amount: event.fee.toString(),
    }))
  )
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  // Fetched once per run; the per-day cache then slices the window it is missing
  const allFees = fetchPartnerFees()
  const fetchRange = async (start: number, end: number) =>
    (await allFees).filter(fee => fee.timestamp >= start && fee.timestamp <= end)

  const { fees } = await getCachedFees('symbiosis', SYMBIOSIS_CHAIN.chainId, startTimestamp, endTimestamp, fetchRange)
  const sorted = fees.sort((a, b) => b.timestamp - a.timestamp)

  console.log(`[symbiosis] Total: ${sorted.length} fees in ${Date.now() - startTime}ms`)

  return enrichFeesWithUsdPrices(sorted)
}
