import type { Hex } from 'viem'
import { padHex } from 'viem'

import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import type { EvmLogClient, LogTopics } from '../utils'
import { buildAssetId, ERC20_TRANSFER_TOPIC, getCachedFees, settleChains } from '../utils'
import { createAlchemyClient } from '../utils/alchemy'

import { CHAIN_CONFIGS, PORTAL_EVENT_SIGNATURE } from './constants'
import type { ChainConfig, PortalTx, TokenTransfer } from './types'

// An address as it appears in an indexed log topic
const addressTopic = (address: string): Hex => padHex(address.toLowerCase() as Hex, { size: 32 })

// Transactions in the window with a Portal event naming our treasury as the partner
const getPortalTxs = async (
  client: EvmLogClient,
  config: ChainConfig,
  fromBlock: number,
  toBlock: number,
  startTimestamp: number,
  endTimestamp: number
): Promise<PortalTx[]> => {
  const topics: LogTopics = [PORTAL_EVENT_SIGNATURE, null, null, addressTopic(config.treasury)]
  const logs = await client.getLogs(undefined, topics, fromBlock, toBlock)
  const timestamps = await client.getBlockTimestamps([...new Set(logs.map(log => Number(log.blockNumber)))])

  // Keyed by tx so a transaction with more than one partner event counts its fee once
  const txs = new Map<string, PortalTx>()
  for (const log of logs) {
    const timestamp = timestamps.get(Number(log.blockNumber))!
    if (timestamp < startTimestamp || timestamp > endTimestamp) continue

    txs.set(log.transactionHash, { txHash: log.transactionHash, blockNumber: Number(log.blockNumber), timestamp })
  }

  return [...txs.values()]
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

const fetchFeesForChain = async (
  config: ChainConfig,
  startTimestamp: number,
  endTimestamp: number
): Promise<Fees[]> => {
  const client = createAlchemyClient(config.chainId, `portals:${config.network}`)
  const [fromBlock, toBlock] = await Promise.all([
    client.resolveBlock(startTimestamp),
    client.resolveBlock(endTimestamp),
  ])

  const txs = await getPortalTxs(client, config, fromBlock, toBlock, startTimestamp, endTimestamp)
  if (txs.length === 0) return []

  const blocks = txs.map(tx => tx.blockNumber)
  const transfers = await getFeeTransfers(client, config, Math.min(...blocks), Math.max(...blocks))

  // Portals pays fees in ERC20 (wrapping native first), so a swap with no transfer paid none: wraps, unwraps, waived dust
  return txs.flatMap(tx => {
    const transfer = transfers.get(tx.txHash)
    if (!transfer) return []

    return {
      chainId: config.chainId,
      assetId: buildAssetId(config.chainId, transfer.token),
      service: 'portals' as const,
      txHash: tx.txHash,
      timestamp: tx.timestamp,
      amount: transfer.amount,
    }
  })
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
  const allFees = perChain.flatMap(result => result.fees).sort((a, b) => b.timestamp - a.timestamp)
  const cacheHits = perChain.reduce((sum, result) => sum + result.cacheHits, 0)
  const cacheMisses = perChain.reduce((sum, result) => sum + result.cacheMisses, 0)

  console.log(
    `[portals] Total: ${allFees.length} fees in ${Date.now() - startTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return enrichFeesWithUsdPrices(allFees)
}
