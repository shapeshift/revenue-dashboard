import { decodeEventLog, parseAbi, toEventSelector } from 'viem'

import { DAO_TREASURIES } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import type { EvmLogClient, Log } from '../utils'
import { getCachedFees, getTreasuryFees, settleChains } from '../utils'

import { ACROSS_CHAINS, ACROSS_HANDLERS_BY_CHAIN_ID } from './constants'

// Current SpokePools emit FilledRelay; FilledV3Relay is its address-typed predecessor, still in the ABI
const FILL_ABI = parseAbi([
  'event FilledRelay(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 repaymentChainId, uint256 indexed originChainId, uint256 indexed depositId, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 exclusiveRelayer, bytes32 indexed relayer, bytes32 depositor, bytes32 recipient, bytes32 messageHash, (bytes32 updatedRecipient, bytes32 updatedMessageHash, uint256 updatedOutputAmount, uint8 fillType) relayExecutionInfo)',
  'event FilledV3Relay(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 repaymentChainId, uint256 indexed originChainId, uint32 indexed depositId, uint32 fillDeadline, uint32 exclusivityDeadline, address exclusiveRelayer, address indexed relayer, address depositor, address recipient, bytes message, (address updatedRecipient, bytes updatedMessage, uint256 updatedOutputAmount, uint8 fillType) relayExecutionInfo)',
])
const FILL_TOPICS: ReadonlySet<string> = new Set(FILL_ABI.map(event => toEventSelector(event)))

// Depositors of the tx's fills; logs from other contracts that share a fill topic don't decode and are left out
const getFillDepositors = (logs: Log[]): string[] =>
  logs
    .filter(log => FILL_TOPICS.has(log.topics[0]))
    .flatMap(log => {
      try {
        const { args } = decodeEventLog({ abi: FILL_ABI, data: log.data, topics: log.topics })
        return [`0x${args.depositor.slice(-40)}`.toLowerCase()]
      } catch {
        return []
      }
    })

// The handler pays a treasury's own bridge output like a fee, so skip fills a treasury deposited
export const isTreasuryDeposit = async (txid: string, client: EvmLogClient): Promise<boolean> => {
  const depositors = getFillDepositors(await client.getReceiptLogs(txid))

  // Every handler payout happens inside a fill, so none recognised means Across changed its event: skip rather than risk counting output
  if (depositors.length === 0) {
    console.warn(`[across] No recognised fill event in fee tx ${txid}; skipping it in case it is a treasury bridge`)
    return true
  }

  return depositors.some(depositor => DAO_TREASURIES.has(depositor))
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
