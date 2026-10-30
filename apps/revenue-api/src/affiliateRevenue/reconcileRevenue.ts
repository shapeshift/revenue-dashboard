import { bnOrZero } from '../lib/bignumber'
import type { Service } from '../types'
import { getDateStartTimestamp } from '../utils/date'

import { ACROSS_CHAINS } from './across/constants'
import { ETHEREUM_CHAIN_ID } from './constants'
import { DEBRIDGE_CHAINS } from './debridge/constants'
import { getPayablePartnerFee } from './payablePartnerFee'
import type { ExcludedPartnerSwap, Fees, PartnerSwap, ReconciliationResult } from './types'

const SWAPPER_TO_SERVICE: Record<string, Service> = {
  Across: 'across',
  AVNU: 'avnu',
  Bebop: 'bebop',
  'BOB Gateway': 'bobgateway',
  ButterSwap: 'butterswap',
  Chainflip: 'chainflip',
  'CoW Swap': 'cowswap',
  deBridge: 'debridge',
  MAYAChain: 'mayachain',
  'NEAR Intents': 'nearintents',
  Portals: 'portals',
  Relay: 'relay',
  Symbiosis: 'symbiosis',
  Fynd: 'fynd',
  THORChain: 'thorchain',
  '0x': 'zrx',
}

// Chains these trackers scan; a partner fee paid elsewhere has no counted gross to net against.
const TRACKED_CHAIN_IDS: Partial<Record<Service, ReadonlySet<string>>> = {
  across: new Set(ACROSS_CHAINS.map(({ chainId }) => chainId)),
  bobgateway: new Set([ETHEREUM_CHAIN_ID]),
  debridge: new Set(DEBRIDGE_CHAINS.map(({ chainId }) => chainId)),
}

export function getUncollectedReason(swap: PartnerSwap, assetId: string): string | undefined {
  const service = SWAPPER_TO_SERVICE[swap.swapperName]
  if (!service) return `unmapped swapper "${swap.swapperName}"`

  const chainId = assetId.split('/')[0] ?? ''
  if (TRACKED_CHAIN_IDS[service] && !TRACKED_CHAIN_IDS[service].has(chainId)) {
    return `${service} tracker doesn't scan ${chainId}`
  }
}

// Nets each payable partner share out of gross as a synthetic fee; swaps that can't be netted are returned as excluded.
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

    // a verified 0-bps swap is payable but owes the partner nothing to net out
    if (bnOrZero(fee.partnerFeeUsd).lte(0)) continue

    const uncollected = getUncollectedReason(swap, fee.assetId)
    if (uncollected) {
      exclude(swap, uncollected)
      continue
    }

    const service = SWAPPER_TO_SERVICE[swap.swapperName]
    if (failed.has(service)) {
      exclude(swap, `provider ${service} failed this run — gross unavailable`)
      continue
    }

    const chainId = fee.assetId.split('/')[0] ?? ''

    netFees.push({
      synthetic: true,
      amount: bnOrZero(fee.partnerFeeCryptoBaseUnit).negated().toFixed(0),
      amountUsd: (-fee.partnerFeeUsd).toString(),
      assetId: fee.assetId,
      chainId,
      service,
      timestamp: getDateStartTimestamp(swap.date),
      txHash: '',
    })
  }

  return { netFees, excluded }
}
