import axios from 'axios'

import { withRetry } from '../../utils/retry'
import {
  getCacheableThreshold,
  getDateEndTimestamp,
  getDateStartTimestamp,
  groupFeesByDate,
  saveCachedFees,
  splitDateRange,
  tryGetCachedFees,
} from '../cache'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { buildAssetId, getBlockByTimestamp, getUnchainedBaseUrl, UNCHAINED_PAGE_SIZE } from '../utils'
import type { UnchainedInternalTx, UnchainedTxHistoryResponse } from '../utils'

import { COW_CHAINS, COW_PAYOUT_SAFES } from './constants'

const isPayoutSafe = (address: string | null | undefined): boolean =>
  !!address && COW_PAYOUT_SAFES.has(address.toLowerCase())

const treasuryPayout = (internalTxs: UnchainedInternalTx[], treasury: string): bigint => {
  return internalTxs.reduce((sum, itx) => {
    if (!isPayoutSafe(itx.from)) return sum
    if (itx.to.toLowerCase() !== treasury.toLowerCase()) return sum
    return sum + BigInt(itx.value)
  }, 0n)
}

const fetchFeesFromUnchained = async (
  chainId: string,
  treasury: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<Fees[]> => {
  const fees: Fees[] = []
  const baseUrl = getUnchainedBaseUrl(chainId)

  const [fromBlock, toBlock] = await Promise.all([
    getBlockByTimestamp(chainId, startTimestamp),
    getBlockByTimestamp(chainId, endTimestamp),
  ])

  if (fromBlock === null || toBlock === null) {
    throw new Error(`Failed to resolve ${chainId} block range for timestamps ${startTimestamp}-${endTimestamp}`)
  }

  let cursor: string | undefined
  do {
    const { data } = await withRetry('cowswap/unchained', () =>
      axios.get<UnchainedTxHistoryResponse>(`${baseUrl}/api/v1/account/${treasury}/txs`, {
        params: {
          pageSize: UNCHAINED_PAGE_SIZE,
          from: fromBlock,
          to: toBlock,
          ...(cursor ? { cursor } : {}),
        },
      })
    )

    for (const tx of data.txs) {
      if (tx.status !== 1) continue
      if (tx.timestamp < startTimestamp || tx.timestamp > endTimestamp) continue
      if (!tx.internalTxs?.length) continue

      const amount = treasuryPayout(tx.internalTxs, treasury)
      if (amount <= 0n) continue

      fees.push({
        chainId,
        assetId: buildAssetId(chainId),
        service: 'cowswap',
        txHash: tx.txid,
        timestamp: tx.timestamp,
        amount: amount.toString(),
      })
    }

    cursor = data.cursor
  } while (cursor)

  return fees
}

const getFeesForChain = async (
  chainId: string,
  treasury: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<Fees[]> => {
  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const cacheLookups = cacheableDates.map(date => ({
    date,
    cached: tryGetCachedFees('cowswap', chainId, date),
  }))
  const cachedFees = cacheLookups.flatMap(({ cached }) => cached ?? [])
  const datesToFetch = cacheLookups.filter(({ cached }) => !cached).map(({ date }) => date)

  const newFees: Fees[] = []
  if (datesToFetch.length > 0) {
    const fetchStart = getDateStartTimestamp(datesToFetch[0])
    const fetchEnd = getDateEndTimestamp(datesToFetch[datesToFetch.length - 1])
    const fetched = await fetchFeesFromUnchained(chainId, treasury, fetchStart, fetchEnd)

    const feesByDate = groupFeesByDate(fetched)
    for (const date of datesToFetch) {
      saveCachedFees('cowswap', chainId, date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromUnchained(chainId, treasury, recentStart, endTimestamp)))
  }

  return [...cachedFees, ...newFees, ...recentFees]
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const perChain = await Promise.all(
    COW_CHAINS.map(({ chainId, treasury }) =>
      getFeesForChain(chainId, treasury, startTimestamp, endTimestamp).catch(error => {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[cowswap] ${chainId} failed: ${message}`)
        return [] as Fees[]
      })
    )
  )

  const allFees = perChain.flat().sort((a, b) => b.timestamp - a.timestamp)
  const duration = Date.now() - startTime
  console.log(`[cowswap] Total: ${allFees.length} fees across ${COW_CHAINS.length} chains in ${duration}ms`)

  return enrichFeesWithUsdPrices(allFees)
}
