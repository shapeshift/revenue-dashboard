import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { getCachedFees } from '../utils'

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
  const solanaChainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'

  const { fees, cacheHits, cacheMisses } = await getCachedFees(
    'jupiter',
    solanaChainId,
    startTimestamp,
    endTimestamp,
    fetchFeesFromAPI
  )

  console.log(
    `[jupiter] Total: ${fees.length} fees in ${Date.now() - startTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return enrichFeesWithUsdPrices(fees)
}
