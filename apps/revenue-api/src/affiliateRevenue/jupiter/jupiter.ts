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

import {
  JUPITER_AFFILIATE_CONTRACT,
  SHAPESHIFT_JUPITER_REFERRAL_KEY,
  SHAPESHIFT_SOLANA_RPC,
  TRACKED_TOKENS,
} from './constants'
import type { TrackedToken } from './constants'
import { deriveReferralTokenAccount, extractFeeFromTransaction, fetchSignatures, fetchTransaction } from './solana'

const fetchFeesForToken = async (
  tokenAccountPda: string,
  token: TrackedToken,
  startTimestamp: number,
  endTimestamp: number
): Promise<Fees[]> => {
  const fees: Fees[] = []
  let beforeSignature: string | undefined

  while (true) {
    const signatures = await fetchSignatures(SHAPESHIFT_SOLANA_RPC, tokenAccountPda, 100, beforeSignature)

    if (signatures.length === 0) {
      break
    }

    for (const sig of signatures) {
      if (!sig.blockTime) {
        continue
      }

      if (sig.blockTime < startTimestamp) {
        return fees
      }

      if (sig.blockTime > endTimestamp) {
        continue
      }

      const tx = await fetchTransaction(SHAPESHIFT_SOLANA_RPC, sig.signature)
      if (!tx || !tx.meta) {
        continue
      }

      const feeAmount = extractFeeFromTransaction(tx)
      if (feeAmount && feeAmount !== '0') {
        fees.push({
          chainId: token.chainId,
          assetId: token.assetId,
          service: 'jupiter',
          txHash: sig.signature,
          timestamp: sig.blockTime,
          amount: feeAmount,
        })
      }
    }

    const lastSig = signatures[signatures.length - 1]
    if (!lastSig || !lastSig.blockTime || lastSig.blockTime < startTimestamp) {
      break
    }

    beforeSignature = lastSig.signature
  }

  return fees
}

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const allFees = await Promise.all(
    TRACKED_TOKENS.map(async token => {
      const pda = deriveReferralTokenAccount(SHAPESHIFT_JUPITER_REFERRAL_KEY, token.mint, JUPITER_AFFILIATE_CONTRACT)

      return fetchFeesForToken(pda.toBase58(), token, startTimestamp, endTimestamp)
    })
  )

  return allFees.flat()
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()
  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  const solanaChainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'

  const cachedFees: Fees[] = []
  const datesToFetch: string[] = []
  let cacheHits = 0
  let cacheMisses = 0

  for (const date of cacheableDates) {
    const cached = tryGetCachedFees('jupiter', solanaChainId, date)
    if (cached) {
      cachedFees.push(...cached)
      cacheHits++
    } else {
      datesToFetch.push(date)
      cacheMisses++
    }
  }

  const newFees: Fees[] = []
  if (datesToFetch.length > 0) {
    const fetchStart = getDateStartTimestamp(datesToFetch[0])
    const fetchEnd = getDateEndTimestamp(datesToFetch[datesToFetch.length - 1])
    const fetched = await fetchFeesFromAPI(fetchStart, fetchEnd)

    const feesByDate = groupFeesByDate(fetched)
    for (const date of datesToFetch) {
      const dateFees = feesByDate[date] || []
      saveCachedFees('jupiter', solanaChainId, date, dateFees)
    }
    newFees.push(...fetched)
  }

  const recentFees: Fees[] = []
  if (recentStart !== null) {
    recentFees.push(...(await fetchFeesFromAPI(recentStart, endTimestamp)))
  }

  const totalFees = cachedFees.length + newFees.length + recentFees.length
  const duration = Date.now() - startTime

  console.log(`[jupiter] Total: ${totalFees} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`)

  const allFees = [...cachedFees, ...newFees, ...recentFees]
  return enrichFeesWithUsdPrices(allFees)
}
