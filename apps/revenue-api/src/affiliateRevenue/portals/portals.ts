import type { Hex } from 'viem'
import { padHex, zeroAddress } from 'viem'

import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import type { EvmLogClient, LogTopics } from '../utils'
import { createEvmLogClient, ERC20_TRANSFER_TOPIC, getCachedFees, settleChains } from '../utils'
import { getAlchemyBlockRangeCap, getAlchemyRpcUrl } from '../utils/alchemy'

import { CHAIN_CONFIGS, PORTAL_EVENT_SIGNATURE } from './constants'
import type { ChainConfig, PortalEventData, TokenTransfer } from './types'
import { buildAssetId, calculateFallbackFee, decodePortalEventData } from './utils'

// An address as it appears in an indexed log topic
const addressTopic = (address: string): Hex => padHex(address.toLowerCase() as Hex, { size: 32 })

// Portal events the router emitted with our treasury as the partner, within the window
const getPortalEvents = async (
  client: EvmLogClient,
  config: ChainConfig,
  fromBlock: number,
  toBlock: number,
  startTimestamp: number,
  endTimestamp: number
): Promise<PortalEventData[]> => {
  const topics: LogTopics = [PORTAL_EVENT_SIGNATURE, null, null, addressTopic(config.treasury)]
  const logs = await client.getLogs(config.router, topics, fromBlock, toBlock)
  const timestamps = await client.getBlockTimestamps([...new Set(logs.map(log => Number(log.blockNumber)))])

  const events: PortalEventData[] = []
  for (const log of logs) {
    const timestamp = timestamps.get(Number(log.blockNumber))!
    if (timestamp < startTimestamp || timestamp > endTimestamp) continue

    const decoded = decodePortalEventData(log.data)
    if (!decoded) continue

    events.push({ txHash: log.transactionHash, blockNumber: Number(log.blockNumber), timestamp, ...decoded })
  }

  return events
}

// The fee is the first ERC20 the treasury receives per tx; its token varies (input, output or intermediate WETH)
const getFeeTransfers = async (
  client: EvmLogClient,
  config: ChainConfig,
  fromBlock: number,
  toBlock: number
): Promise<Map<string, TokenTransfer>> => {
  const logs = await client.getLogs(
    undefined,
    [ERC20_TRANSFER_TOPIC, null, addressTopic(config.treasury)],
    fromBlock,
    toBlock
  )

  const transfers = new Map<string, TokenTransfer>()
  for (const log of logs) {
    if (log.data.length <= 2 || transfers.has(log.transactionHash)) continue
    transfers.set(log.transactionHash, { token: log.address, amount: BigInt(log.data).toString() })
  }

  return transfers
}

// A swap that sent the treasury no token paid in native, so the fee is derived from the input amount
const constructFee = (config: ChainConfig, event: PortalEventData, transfer: TokenTransfer | undefined): Fees => {
  const fee = transfer
    ? { assetId: buildAssetId(config.chainId, transfer.token), amount: transfer.amount }
    : {
        assetId: buildAssetId(config.chainId, event.inputToken ?? zeroAddress),
        amount: calculateFallbackFee(event.inputAmount, event.timestamp),
      }

  return { chainId: config.chainId, service: 'portals', txHash: event.txHash, timestamp: event.timestamp, ...fee }
}

const fetchFeesForChain = async (
  config: ChainConfig,
  startTimestamp: number,
  endTimestamp: number
): Promise<Fees[]> => {
  const client = createEvmLogClient(
    config.chainId,
    getAlchemyRpcUrl(config.alchemyNetwork),
    `portals:${config.network}`,
    getAlchemyBlockRangeCap(config.alchemyNetwork)
  )
  const [fromBlock, toBlock] = await Promise.all([
    client.resolveBlock(startTimestamp),
    client.resolveBlock(endTimestamp),
  ])

  const events = await getPortalEvents(client, config, fromBlock, toBlock, startTimestamp, endTimestamp)
  if (events.length === 0) return []

  const blocks = events.map(event => event.blockNumber)
  const transfers = await getFeeTransfers(client, config, Math.min(...blocks), Math.max(...blocks))

  return events
    .map(event => constructFee(config, event, transfers.get(event.txHash)))
    .sort((a, b) => b.timestamp - a.timestamp)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const perChain = await settleChains(
    'portals',
    CHAIN_CONFIGS,
    config => config.network,
    config =>
      getCachedFees('portals', config.chainId, startTimestamp, endTimestamp, (start, end) =>
        fetchFeesForChain(config, start, end)
      )
  )
  const allFees = perChain.flatMap(result => result.fees)
  const cacheHits = perChain.reduce((sum, result) => sum + result.cacheHits, 0)
  const cacheMisses = perChain.reduce((sum, result) => sum + result.cacheMisses, 0)

  console.log(
    `[portals] Total: ${allFees.length} fees in ${Date.now() - startTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return enrichFeesWithUsdPrices(allFees)
}
