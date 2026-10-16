import { decodeEventLog, isAddressEqual, toEventSelector } from 'viem'

import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import type { Log } from '../utils'
import { buildAssetId, createEvmLogClient, getCachedFees, settleChains } from '../utils'
import { getAlchemyBlockRangeCap, getAlchemyRpcUrl } from '../utils/alchemy'

import type { FyndChain } from './constants'
import { FEES_TAKEN_EVENT, FYND_CHAINS, FYND_FEE_RECEIVER, FYND_FIRST_FEE_TIMESTAMP } from './constants'

type FeeTaken = { token: string; fee: bigint; blockNumber: number; txHash: string }

const FEES_TAKEN_TOPIC = toEventSelector(FEES_TAKEN_EVENT)

// Our share of one swap's fees, or undefined when the swap carried no fee for our receiver
const decodeOurFee = (log: Log): FeeTaken | undefined => {
  const { args } = decodeEventLog({ abi: [FEES_TAKEN_EVENT], topics: log.topics, data: log.data })

  const fee = args.fees
    .filter(({ recipient }) => isAddressEqual(recipient, FYND_FEE_RECEIVER))
    .reduce((sum, { feeAmount }) => sum + feeAmount, 0n)
  if (fee === 0n) return

  return { token: args.token.toLowerCase(), fee, blockNumber: Number(log.blockNumber), txHash: log.transactionHash }
}

const fetchChainFees = async (chain: FyndChain, startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const client = createEvmLogClient(
    chain.chainId,
    getAlchemyRpcUrl(chain.alchemyNetwork),
    `fynd:${chain.network}`,
    getAlchemyBlockRangeCap(chain.alchemyNetwork)
  )

  const [fromBlock, toBlock] = await Promise.all([
    client.resolveBlock(startTimestamp),
    client.resolveBlock(endTimestamp),
  ])

  // Every FeesTaken on the router, ours or not
  const logs = await client.getLogs(chain.router, [FEES_TAKEN_TOPIC], fromBlock, toBlock)
  const events = logs.map(decodeOurFee).filter((event): event is FeeTaken => event !== undefined)
  const timestamps = await client.getBlockTimestamps([...new Set(events.map(event => event.blockNumber))])

  return events
    .map(event => ({
      chainId: chain.chainId,
      assetId: buildAssetId(chain.chainId, event.token),
      service: 'fynd' as const,
      txHash: event.txHash,
      timestamp: timestamps.get(event.blockNumber)!,
      amount: event.fee.toString(),
    }))
    .filter(fee => fee.timestamp >= startTimestamp && fee.timestamp <= endTimestamp)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const scanStart = Math.max(startTimestamp, FYND_FIRST_FEE_TIMESTAMP)
  if (endTimestamp < scanStart) return []

  const perChain = await settleChains(
    'fynd',
    FYND_CHAINS,
    chain => chain.network,
    chain =>
      getCachedFees('fynd', chain.chainId, scanStart, endTimestamp, (start, end) => fetchChainFees(chain, start, end))
  )
  const sorted = perChain.flatMap(result => result.fees).sort((a, b) => b.timestamp - a.timestamp)

  console.log(`[fynd] Total: ${sorted.length} fees in ${Date.now() - startTime}ms`)

  return enrichFeesWithUsdPrices(sorted)
}
