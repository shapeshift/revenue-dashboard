import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { getCachedFees, getTreasuryFees } from '../utils'

import { ACROSS_CHAINS, ACROSS_HANDLERS_BY_CHAIN_ID } from './constants'

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
    })
  }

  const { fees } = await getCachedFees('across', chainId, startTimestamp, endTimestamp, fetchRange)

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const perChain = await Promise.all(
    ACROSS_CHAINS.map(({ chainId, treasury }) =>
      getFeesForChain(chainId, treasury, startTimestamp, endTimestamp).catch(error => {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[across] ${chainId} failed: ${message}`)
        return [] as Fees[]
      })
    )
  )

  const allFees = perChain.flat().sort((a, b) => b.timestamp - a.timestamp)
  const duration = Date.now() - startTime
  console.log(`[across] Total: ${allFees.length} fees across ${ACROSS_CHAINS.length} chains in ${duration}ms`)

  return enrichFeesWithUsdPrices(allFees)
}
