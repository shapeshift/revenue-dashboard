import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { getCachedFees, getTreasuryFees, settleChains } from '../utils'

import { DEBRIDGE_CHAINS, DEBRIDGE_FEE_SENDERS } from './constants'

const getFeesForChain = async (
  chainId: string,
  treasury: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<Fees[]> => {
  const fetchRange = (start: number, end: number) => {
    return getTreasuryFees({
      service: 'debridge',
      chainId,
      treasury,
      senders: DEBRIDGE_FEE_SENDERS,
      startTimestamp: start,
      endTimestamp: end,
    })
  }

  const { fees } = await getCachedFees('debridge', chainId, startTimestamp, endTimestamp, fetchRange)

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const perChain = await settleChains(
    'debridge',
    DEBRIDGE_CHAINS,
    ({ chainId }) => chainId,
    ({ chainId, treasury }) => getFeesForChain(chainId, treasury, startTimestamp, endTimestamp)
  )

  const allFees = perChain.flat().sort((a, b) => b.timestamp - a.timestamp)
  const duration = Date.now() - startTime
  console.log(`[debridge] Total: ${allFees.length} fees across ${DEBRIDGE_CHAINS.length} chains in ${duration}ms`)

  return enrichFeesWithUsdPrices(allFees)
}
