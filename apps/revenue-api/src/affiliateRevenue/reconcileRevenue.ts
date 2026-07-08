import { bnOrZero } from '../lib/bignumber'
import type { Service } from '../types'
import { getDateStartTimestamp } from '../utils/date'

import { getPayablePartnerFee } from './payablePartnerFee'
import type { ExcludedPartnerSwap, Fees, PartnerSwap, ReconciliationResult } from './types'

const SWAPPER_TO_SERVICE: Record<string, Service> = {
  AVNU: 'avnu',
  Bebop: 'bebop',
  ButterSwap: 'butterswap',
  Chainflip: 'chainflip',
  'CoW Swap': 'cowswap',
  MAYAChain: 'mayachain',
  'NEAR Intents': 'nearintents',
  Portals: 'portals',
  Relay: 'relay',
  THORChain: 'thorchain',
  '0x': 'zrx',
}

// Subtract each partner's payable share (`partnerFeeUsd` + its on-chain crypto share) from gross
// fees for ShapeShift-net revenue, attributed to the affiliate-fee asset. Only payable swaps (see
// getPayablePartnerFee) are deducted; a swap is excluded — never silently — when it isn't payable,
// its swapper isn't mapped, or its provider failed this run (so we'd deduct against absent gross).
// Excluded swaps that carry a partner fee are returned for audit logging.
export function reconcilePartnerRevenue(
  fees: Fees[],
  partnerSwaps: PartnerSwap[],
  failedProviders: Service[]
): ReconciliationResult {
  const failed = new Set(failedProviders)
  const netFees: Fees[] = [...fees]
  const excluded: ExcludedPartnerSwap[] = []

  const exclude = (swap: PartnerSwap, reason: string) => {
    excluded.push({
      swapId: swap.swapId,
      partnerCode: swap.partnerCode,
      swapperName: swap.swapperName,
      reason,
      partnerFeeUsd: bnOrZero(swap.partnerFeeUsd).toNumber(),
    })
  }

  for (const swap of partnerSwaps) {
    const fee = getPayablePartnerFee(swap)
    if (!fee.payable) {
      if (bnOrZero(swap.partnerFeeUsd).gt(0)) exclude(swap, fee.reason)
      continue
    }

    // A verified 0-bps swap is payable but its share is $0 — there's nothing to deduct from gross,
    // so emit no synthetic adjustment (an empty-assetId $0 entry would only add noise downstream).
    if (bnOrZero(fee.partnerFeeUsd).lte(0)) continue

    const service = SWAPPER_TO_SERVICE[swap.swapperName]
    if (!service) {
      exclude(swap, `unmapped swapper "${swap.swapperName}"`)
      continue
    }

    if (failed.has(service)) {
      exclude(swap, `provider ${service} failed this run — gross unavailable`)
      continue
    }

    netFees.push({
      synthetic: true,
      amount: bnOrZero(fee.partnerFeeCryptoBaseUnit).negated().toFixed(0),
      amountUsd: (-fee.partnerFeeUsd).toString(),
      assetId: fee.assetId,
      chainId: fee.assetId.split('/')[0] ?? '',
      service,
      timestamp: getDateStartTimestamp(swap.date),
      txHash: '',
    })
  }

  return { netFees, excluded }
}
