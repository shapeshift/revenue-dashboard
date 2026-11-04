import type { Address } from 'viem'
import { decodeEventLog, isAddressEqual, toEventSelector } from 'viem'

import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import type { Log } from '../utils'
import { buildAssetId, getCachedFees, settleChains } from '../utils'
import { createAlchemyClient } from '../utils/alchemy'

import type { KyberChain } from './constants'
import { FEE_EVENT, KYBER_CHAINS, KYBER_FIRST_FEE_TIMESTAMP, KYBER_ROUTER } from './constants'

type FeeTaken = { token: string; fee: bigint; blockNumber: number; txHash: string }

const FEE_TOPIC = toEventSelector(FEE_EVENT)
const BPS_DENOMINATOR = 10_000n

// Our share of one swap's fee, or undefined when the swap paid nothing to the treasury
const decodeOurFee = (log: Log, treasury: Address): FeeTaken | undefined => {
  const { args } = decodeEventLog({ abi: [FEE_EVENT], topics: log.topics, data: log.data })

  const fee = args.recipients.reduce((sum, recipient, i) => {
    if (!isAddressEqual(recipient, treasury)) return sum
    const amount = args.amounts[i] ?? 0n
    return sum + (args.isBps ? (args.totalAmount * amount) / BPS_DENOMINATOR : amount)
  }, 0n)
  if (fee === 0n) return

  return { token: args.token.toLowerCase(), fee, blockNumber: Number(log.blockNumber), txHash: log.transactionHash }
}

const fetchChainFees = async (chain: KyberChain, startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const client = createAlchemyClient(chain.chainId, `kyberswap:${chain.network}`)
  const [fromBlock, toBlock] = await Promise.all([
    client.resolveBlock(startTimestamp),
    client.resolveBlock(endTimestamp),
  ])

  // Every Fee on the router, ours or not
  const logs = await client.getLogs(KYBER_ROUTER, [FEE_TOPIC], fromBlock, toBlock)
  const events = logs
    .map(log => decodeOurFee(log, chain.treasury))
    .filter((event): event is FeeTaken => event !== undefined)
  const timestamps = await client.getBlockTimestamps([...new Set(events.map(event => event.blockNumber))])

  return events
    .map(event => ({
      chainId: chain.chainId,
      assetId: buildAssetId(chain.chainId, event.token),
      service: 'kyberswap' as const,
      txHash: event.txHash,
      timestamp: timestamps.get(event.blockNumber)!,
      amount: event.fee.toString(),
    }))
    .filter(fee => fee.timestamp >= startTimestamp && fee.timestamp <= endTimestamp)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const scanStart = Math.max(startTimestamp, KYBER_FIRST_FEE_TIMESTAMP)
  if (endTimestamp < scanStart) return []

  const perChain = await settleChains(
    'kyberswap',
    KYBER_CHAINS,
    chain => chain.network,
    chain =>
      getCachedFees('kyberswap', chain.chainId, scanStart, endTimestamp, (start, end) =>
        fetchChainFees(chain, start, end)
      )
  )
  const sorted = perChain.flatMap(result => result.fees).sort((a, b) => b.timestamp - a.timestamp)

  console.log(`[kyberswap] Total: ${sorted.length} fees in ${Date.now() - startTime}ms`)

  return enrichFeesWithUsdPrices(sorted)
}
