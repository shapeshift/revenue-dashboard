import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { getCachedFees, getTreasuryFees, settleChains } from '../utils'

import { COW_CHAINS, COW_PAYOUT_SAFES } from './constants'

const getFeesForChain = async (
  chainId: string,
  treasury: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<Fees[]> => {
  const fetchRange = (start: number, end: number) => {
    return getTreasuryFees({
      service: 'cowswap',
      chainId,
      treasury,
      senders: COW_PAYOUT_SAFES,
      startTimestamp: start,
      endTimestamp: end,
    })
  }

  const { fees } = await getCachedFees('cowswap', chainId, startTimestamp, endTimestamp, fetchRange)

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const results = await Promise.allSettled(
    COW_CHAINS.map(({ chainId, treasury }) => getFeesForChain(chainId, treasury, startTimestamp, endTimestamp))
  )
  const perChain = settleChains(
    'cowswap',
    COW_CHAINS.map(({ chainId }) => chainId),
    results
  )

  const allFees = perChain.flat().sort((a, b) => b.timestamp - a.timestamp)
  const duration = Date.now() - startTime
  console.log(`[cowswap] Total: ${allFees.length} fees across ${COW_CHAINS.length} chains in ${duration}ms`)

  return enrichFeesWithUsdPrices(allFees)
}
