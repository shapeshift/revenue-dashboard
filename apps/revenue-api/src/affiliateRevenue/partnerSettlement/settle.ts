import { getDateStartTimestamp } from '../cache'
import type { Fees } from '../index'
import { mapSwapperNameToService } from './swapperServiceMap'
import type { PartnerRevenue, PartnerSwapRow, SettlementResult } from './types'

const norm = (h: string | null | undefined): string | null => (h ? h.toLowerCase() : null)

export function buildSettlement(fees: Fees[], partnerSwaps: PartnerSwapRow[]): SettlementResult {
  const byTxHash = new Map<string, PartnerSwapRow>()
  for (const s of partnerSwaps) {
    for (const h of [norm(s.sellTxHash), norm(s.buyTxHash)]) {
      if (h) byTxHash.set(h, s)
    }
  }

  const byPartner: Record<string, PartnerRevenue> = {}
  const ensure = (code: string): PartnerRevenue =>
    (byPartner[code] ??= {
      partnerCode: code, totalUsd: 0, totalVolumeUsd: 0, swapCount: 0, byService: {}, byDate: {},
    })
  const credit = (s: PartnerSwapRow, usd: number) => {
    const p = ensure(s.partnerCode)
    p.totalUsd += usd
    p.swapCount += 1
    p.totalVolumeUsd += s.volumeUsd ?? 0
    p.byService[s.swapperName] = (p.byService[s.swapperName] ?? 0) + usd
    p.byDate[s.date] = (p.byDate[s.date] ?? 0) + usd
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
    // A matched swap is fully accounted for here (split or left intact) — it must
    // never fall through to the unmatched-fallback loop below, or it would be
    // credited/synthesized a second time (double accounting).
    matched.add(s)
    if (!s.affiliateBps || s.affiliateBps <= 0) {
      netFees.push(fee)
      continue
    }
    const amountUsd = parseFloat(fee.amountUsd || '0')
    const partnerRate = Math.min(s.partnerBps / s.affiliateBps, 1)
    const partnerShare = amountUsd * partnerRate
    netFees.push({ ...fee, amountUsd: (amountUsd - partnerShare).toString() })
    credit(s, partnerShare)
  }

  let unrCount = 0
  let unrUsd = 0
  for (const s of partnerSwaps) {
    if (matched.has(s)) continue
    const partnerFeeUsd = s.partnerFeeUsd ?? 0
    const service = mapSwapperNameToService(s.swapperName)
    if (service && partnerFeeUsd > 0) {
      netFees.push({
        synthetic: true, amount: '0', amountUsd: (-partnerFeeUsd).toString(),
        assetId: '', chainId: '', service, timestamp: getDateStartTimestamp(s.date), txHash: '',
      })
    }
    credit(s, partnerFeeUsd)
    unrCount += 1
    unrUsd += partnerFeeUsd
  }

  const partnerTotalUsd = Object.values(byPartner).reduce((sum, p) => sum + p.totalUsd, 0)
  return { netFees, byPartner, partnerTotalUsd, unreconciled: { count: unrCount, usd: unrUsd } }
}
