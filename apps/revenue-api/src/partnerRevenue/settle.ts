import { getDateStartTimestamp } from '../affiliateRevenue/cache'
import type { Fees } from '../affiliateRevenue/index'
import type { Service } from '../types'

import type { PartnerSwapRow, SettlementResult } from './types'

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

const norm = (h: string | null | undefined): string | null => (h ? h.toLowerCase() : null)

// Peel partner cuts out of the gross provider fee events so the revenue view reports
// ShapeShift-net. A fee matched to a partner swap by txHash is reduced by that swap's bps
// share; a partner swap with no matching fee event falls back to a synthetic negative fee on
// its mapped service and is counted as `unreconciled`. Partner revenue itself is reported
// separately, straight from the swaps (see aggregatePartnerRevenue).
export function buildSettlement(fees: Fees[], partnerSwaps: PartnerSwapRow[]): SettlementResult {
  const byTxHash = new Map<string, PartnerSwapRow>()
  for (const s of partnerSwaps) {
    for (const h of [norm(s.sellTxHash), norm(s.buyTxHash)]) {
      if (h) byTxHash.set(h, s)
    }
  }

  const matched = new Set<PartnerSwapRow>()
  const netFees: Fees[] = []

  for (const fee of fees) {
    const h = norm(fee.txHash)
    const s = h ? byTxHash.get(h) : undefined
    if (!s) {
      netFees.push(fee)
      continue
    }
    // A matched swap is fully accounted for here (split or left intact) — it must never fall
    // through to the unmatched-fallback loop below, or it would be peeled a second time.
    matched.add(s)
    if (!s.affiliateBps || s.affiliateBps <= 0) {
      netFees.push(fee)
      continue
    }
    const amountUsd = parseFloat(fee.amountUsd || '0')
    const partnerRate = Math.min(s.partnerBps / s.affiliateBps, 1)
    const partnerShare = amountUsd * partnerRate
    netFees.push({ ...fee, amountUsd: (amountUsd - partnerShare).toString() })
  }

  let unrCount = 0
  let unrUsd = 0
  for (const s of partnerSwaps) {
    if (matched.has(s)) continue
    const partnerFeeUsd = s.partnerFeeUsd ?? 0
    const service = SWAPPER_TO_SERVICE[s.swapperName]
    if (service && partnerFeeUsd > 0) {
      netFees.push({
        synthetic: true,
        amount: '0',
        amountUsd: (-partnerFeeUsd).toString(),
        assetId: '',
        chainId: '',
        service,
        timestamp: getDateStartTimestamp(s.date),
        txHash: '',
      })
    }
    unrCount += 1
    unrUsd += partnerFeeUsd
  }

  return { netFees, unreconciled: { count: unrCount, usd: unrUsd } }
}
