import type { PartnerRevenue, PartnerSwapRow } from './types'

// Aggregate each partner's revenue directly from their swaps. swap-service's per-swap
// `partnerFeeUsd` is the authoritative partner-attributed fee, so the partner view is a
// straight roll-up of the affiliate swaps — independent of affiliate provider revenue / settlement.
export function aggregatePartnerRevenue(swaps: PartnerSwapRow[]): {
  byPartner: Record<string, PartnerRevenue>
  partnerTotalUsd: number
} {
  const byPartner: Record<string, PartnerRevenue> = {}

  for (const s of swaps) {
    const usd = s.partnerFeeUsd ?? 0
    const p = (byPartner[s.partnerCode] ??= {
      partnerCode: s.partnerCode,
      totalUsd: 0,
      totalVolumeUsd: 0,
      swapCount: 0,
      byService: {},
      byDate: {},
    })
    p.totalUsd += usd
    p.totalVolumeUsd += s.volumeUsd ?? 0
    p.swapCount += 1
    p.byService[s.swapperName] = (p.byService[s.swapperName] ?? 0) + usd
    p.byDate[s.date] = (p.byDate[s.date] ?? 0) + usd
  }

  const partnerTotalUsd = Object.values(byPartner).reduce((sum, p) => sum + p.totalUsd, 0)
  return { byPartner, partnerTotalUsd }
}
