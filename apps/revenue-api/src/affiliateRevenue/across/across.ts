import { decodeEventLog, parseAbi, toEventSelector } from 'viem'

import { DAO_TREASURIES } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import type { EvmLogClient } from '../utils'
import { getCachedFees, getTreasuryFees, settleChains } from '../utils'

import { ACROSS_CHAINS, ACROSS_HANDLERS_BY_CHAIN_ID } from './constants'

const FILLED_RELAY_ABI = parseAbi([
  'event FilledRelay(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 repaymentChainId, uint256 indexed originChainId, uint256 indexed depositId, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 exclusiveRelayer, bytes32 indexed relayer, bytes32 depositor, bytes32 recipient, bytes32 messageHash, (bytes32 updatedRecipient, bytes32 updatedMessageHash, uint256 updatedOutputAmount, uint8 fillType) relayExecutionInfo)',
])
const FILLED_RELAY_TOPIC = toEventSelector(FILLED_RELAY_ABI[0])

// The handler pays a treasury's own bridge output like a fee, so skip fills a treasury deposited
export const isTreasuryDeposit = async (txid: string, client: EvmLogClient): Promise<boolean> => {
  const logs = await client.getReceiptLogs(txid)

  return logs
    .filter(log => log.topics[0] === FILLED_RELAY_TOPIC)
    .some(log => {
      const { args } = decodeEventLog({ abi: FILLED_RELAY_ABI, data: log.data, topics: log.topics })
      return DAO_TREASURIES.has(`0x${args.depositor.slice(26)}`)
    })
}

const getFeesForChain = async (
  chainId: string,
  treasury: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<Fees[]> => {
  const senders = ACROSS_HANDLERS_BY_CHAIN_ID[chainId]
  if (!senders?.length) throw new Error(`No Across handler configured for ${chainId}`)

  const fetchRange = (start: number, end: number) => {
    return getTreasuryFees({
      service: 'across',
      chainId,
      treasury,
      senders,
      startTimestamp: start,
      endTimestamp: end,
      isOwnSwap: isTreasuryDeposit,
    })
  }

  const { fees } = await getCachedFees('across', chainId, startTimestamp, endTimestamp, fetchRange)

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const perChain = await settleChains(
    'across',
    ACROSS_CHAINS,
    ({ chainId }) => chainId,
    ({ chainId, treasury }) => getFeesForChain(chainId, treasury, startTimestamp, endTimestamp)
  )

  const allFees = perChain.flat().sort((a, b) => b.timestamp - a.timestamp)
  const duration = Date.now() - startTime
  console.log(`[across] Total: ${allFees.length} fees across ${ACROSS_CHAINS.length} chains in ${duration}ms`)

  return enrichFeesWithUsdPrices(allFees)
}
