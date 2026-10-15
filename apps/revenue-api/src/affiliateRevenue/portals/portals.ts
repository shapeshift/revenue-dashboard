import { erc20Abi, padHex, toEventSelector, zeroAddress } from 'viem'

import { formatError } from '../../utils/error'
import { getCachedTokenTransfer, saveCachedTokenTransfer } from '../cache'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import type { EvmLogClient, Log } from '../utils'
import { createEvmLogClient, getCachedFees } from '../utils'

import { CHAIN_CONFIGS, PORTAL_EVENT_SIGNATURE } from './constants'
import type { ChainConfig, PortalEventData, TokenTransfer } from './types'
import { buildAssetId, calculateFallbackFee, decodePortalEventData } from './utils'

const ERC20_TRANSFER_TOPIC = toEventSelector(erc20Abi.find(item => item.type === 'event' && item.name === 'Transfer')!)
const LOOKUP_CONCURRENCY = 10

const treasuryTopic = (config: ChainConfig) => padHex(config.treasury.toLowerCase() as `0x${string}`, { size: 32 })

// The ERC20 the router sent the treasury in this transaction; the fallback covers native fees
export const getFeeTransferFromReceipt = (logs: Log[], treasury: string): TokenTransfer | null => {
  const transfer = logs.find(
    log =>
      log.topics[0] === ERC20_TRANSFER_TOPIC &&
      log.topics[2]?.toLowerCase() === padHex(treasury.toLowerCase() as `0x${string}`, { size: 32 }) &&
      log.data.length > 2
  )
  if (!transfer) return null

  return { token: transfer.address, amount: BigInt(transfer.data).toString() }
}

// Portal events the router emitted with our treasury as the partner, over the window's blocks
const getPortalEvents = async (
  client: EvmLogClient,
  config: ChainConfig,
  startTimestamp: number,
  endTimestamp: number
): Promise<PortalEventData[]> => {
  const [fromBlock, toBlock] = await Promise.all([client.resolveBlock(startTimestamp), client.resolveBlock(endTimestamp)])
  if (fromBlock === null || toBlock === null) {
    throw new Error(`could not resolve blocks for ${startTimestamp}-${endTimestamp}`)
  }

  const logs = await client.getLogs(config.router, [PORTAL_EVENT_SIGNATURE, null, null, treasuryTopic(config)], fromBlock, toBlock)
  const timestamps = await client.getBlockTimestamps([...new Set(logs.map(log => Number(log.blockNumber)))])

  const events: PortalEventData[] = []
  for (const log of logs) {
    const timestamp = timestamps.get(Number(log.blockNumber))!
    if (timestamp < startTimestamp || timestamp > endTimestamp) continue

    const decoded = decodePortalEventData(log.data)
    if (!decoded) continue

    events.push({ txHash: log.transactionHash, timestamp, ...decoded })
  }

  return events
}

const getFeeTransfer = async (client: EvmLogClient, config: ChainConfig, txHash: string): Promise<TokenTransfer | null> => {
  const cacheKey = `${config.chainId}:${txHash}`
  const cached = getCachedTokenTransfer(cacheKey)
  if (cached !== undefined) return cached

  const receipt = await client.getTransactionReceipt(txHash)
  const transfer = receipt ? getFeeTransferFromReceipt(receipt.logs, config.treasury) : null
  saveCachedTokenTransfer(cacheKey, transfer)

  return transfer
}

const constructFeeFromEvent = async (client: EvmLogClient, config: ChainConfig, event: PortalEventData): Promise<Fees> => {
  const feeTransfer = await getFeeTransfer(client, config, event.txHash)

  const fee = feeTransfer
    ? { assetId: buildAssetId(config.chainId, feeTransfer.token), amount: feeTransfer.amount }
    : {
        assetId: buildAssetId(config.chainId, event.inputToken ?? zeroAddress),
        amount: calculateFallbackFee(event.inputAmount, event.timestamp),
      }

  return { chainId: config.chainId, service: 'portals', txHash: event.txHash, timestamp: event.timestamp, ...fee }
}

const fetchFeesForChain = async (config: ChainConfig, startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const client = createEvmLogClient(config.chainId, config.rpcUrl, `portals:${config.network}`)
  const events = await getPortalEvents(client, config, startTimestamp, endTimestamp)

  const fees: Fees[] = []
  for (let i = 0; i < events.length; i += LOOKUP_CONCURRENCY) {
    fees.push(
      ...(await Promise.all(events.slice(i, i + LOOKUP_CONCURRENCY).map(event => constructFeeFromEvent(client, config, event))))
    )
  }

  return fees.sort((a, b) => b.timestamp - a.timestamp)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()
  const allFees: Fees[] = []
  let cacheHits = 0
  let cacheMisses = 0

  const results = await Promise.allSettled(
    CHAIN_CONFIGS.map(config =>
      getCachedFees('portals', config.chainId, startTimestamp, endTimestamp, (start, end) =>
        fetchFeesForChain(config, start, end)
      )
    )
  )

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allFees.push(...result.value.fees)
      cacheHits += result.value.cacheHits
      cacheMisses += result.value.cacheMisses
    } else {
      console.error(`[portals] ${CHAIN_CONFIGS[i].network} failed: ${formatError(result.reason)}`)
    }
  })

  console.log(
    `[portals] Total: ${allFees.length} fees in ${Date.now() - startTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return enrichFeesWithUsdPrices(allFees)
}
