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
import { DAO_TREASURY_ETHEREUM, ETHEREUM_CHAIN_ID } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { buildAssetId, getBlockByTimestamp } from '../utils'

import type { UnchainedTxHistoryResponse } from './types'

export const UNCHAINED_BASE_URL = 'https://api.ethereum.shapeshift.com'
export const UNCHAINED_PAGE_SIZE = 100

export const BOB_GATEWAY_FIRST_FEE_BLOCK = 25288446
export const BOB_GATEWAY_METHOD_SELECTORS: Record<string, string> = {
  '0xd7ff3ef6': 'releaseFundsAndCallStrategy',
  '0xf6a1eaad': 'finalizeOfframpOrder',
}

const fetchFeesFromUnchained = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []

  const [fromBlock, toBlock] = await Promise.all([
    getBlockByTimestamp(ETHEREUM_CHAIN_ID, startTimestamp),
    getBlockByTimestamp(ETHEREUM_CHAIN_ID, endTimestamp),
  ])

  if (fromBlock === null || toBlock === null) {
    throw new Error(`Failed to resolve block range for timestamps ${startTimestamp}-${endTimestamp}`)
  }

  // Skip everything before BOB's first fee; bail early if the window predates it entirely.
  const effectiveFromBlock = Math.max(fromBlock, BOB_GATEWAY_FIRST_FEE_BLOCK)
  if (effectiveFromBlock > toBlock) return fees

  let cursor: string | undefined
  do {
    const { data } = await withRetry('bobgateway/unchained', () =>
      axios.get<UnchainedTxHistoryResponse>(`${UNCHAINED_BASE_URL}/api/v1/account/${DAO_TREASURY_ETHEREUM}/txs`, {
        params: {
          pageSize: UNCHAINED_PAGE_SIZE,
          from: effectiveFromBlock,
          to: toBlock,
          ...(cursor ? { cursor } : {}),
        },
      })
    )

    for (const tx of data.txs) {
      if (tx.status !== 1) continue
      if (tx.timestamp < startTimestamp || tx.timestamp > endTimestamp) continue

      const selector = (tx.inputData ?? '').slice(0, 10).toLowerCase()

      const method = BOB_GATEWAY_METHOD_SELECTORS[selector]
      if (!method) continue

      const feeTransfer = tx.tokenTransfers?.find(t => t.to.toLowerCase() === DAO_TREASURY_ETHEREUM.toLowerCase())

      if (!feeTransfer) {
        console.warn(`[bobgateway] no affiliate fee detected for ${tx.txid} (${method})`)
        continue
      }

      fees.push({
        chainId: ETHEREUM_CHAIN_ID,
        assetId: buildAssetId(ETHEREUM_CHAIN_ID, feeTransfer.contract),
        service: 'bobgateway',
        txHash: tx.txid,
        timestamp: tx.timestamp,
        amount: feeTransfer.value,
      })
    }

    cursor = data.cursor
  } while (cursor)

  return fees.sort((a, b) => b.timestamp - a.timestamp)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()
  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const cacheLookups = cacheableDates.map(date => ({
    date,
    cached: tryGetCachedFees('bobgateway', ETHEREUM_CHAIN_ID, date),
  }))
  const cachedFees = cacheLookups.flatMap(({ cached }) => cached ?? [])
  const datesToFetch = cacheLookups.filter(({ cached }) => !cached).map(({ date }) => date)
  const cacheMisses = datesToFetch.length
  const cacheHits = cacheableDates.length - cacheMisses

  const newFees: Fees[] = []
  if (datesToFetch.length > 0) {
    const fetchStart = getDateStartTimestamp(datesToFetch[0])
    const fetchEnd = getDateEndTimestamp(datesToFetch[datesToFetch.length - 1])
    const fetched = await fetchFeesFromUnchained(fetchStart, fetchEnd)

    const feesByDate = groupFeesByDate(fetched)
    for (const date of datesToFetch) {
      saveCachedFees('bobgateway', ETHEREUM_CHAIN_ID, date, feesByDate[date] || [])
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromUnchained(recentStart, endTimestamp)))
  }

  const allFees = [...cachedFees, ...newFees, ...recentFees]
  const duration = Date.now() - startTime
  console.log(
    `[bobgateway] Total: ${allFees.length} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return enrichFeesWithUsdPrices(allFees)
}
