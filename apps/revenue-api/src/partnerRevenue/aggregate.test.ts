import { describe, expect, test } from 'bun:test'

import { aggregatePartnerRevenue } from './aggregate'
import type { PartnerSwapRow } from './types'

const swap = (over: Partial<PartnerSwapRow>): PartnerSwapRow => ({
  partnerCode: 'alpha',
  swapperName: 'THORChain',
  sellTxHash: null,
  buyTxHash: null,
  partnerBps: 50,
  affiliateBps: 60,
  feeUsd: 6,
  partnerFeeUsd: 5,
  volumeUsd: 1000,
  date: '2026-06-01',
  ...over,
})

describe('aggregatePartnerRevenue', () => {
  test('sums partnerFeeUsd per partner, bucketed by swapperName and date', () => {
    const { byPartner, partnerTotalUsd } = aggregatePartnerRevenue([
      swap({}),
      swap({ swapperName: '0x', partnerFeeUsd: 3, volumeUsd: 200, date: '2026-06-02' }),
      swap({ partnerCode: 'beta', partnerFeeUsd: 10, volumeUsd: 500 }),
    ])

    expect(byPartner.alpha.totalUsd).toBeCloseTo(8, 6)
    expect(byPartner.alpha.totalVolumeUsd).toBeCloseTo(1200, 6)
    expect(byPartner.alpha.swapCount).toBe(2)
    expect(byPartner.alpha.byService.THORChain).toBeCloseTo(5, 6)
    expect(byPartner.alpha.byService['0x']).toBeCloseTo(3, 6)
    expect(byPartner.alpha.byDate['2026-06-01']).toBeCloseTo(5, 6)
    expect(byPartner.alpha.byDate['2026-06-02']).toBeCloseTo(3, 6)
    expect(byPartner.beta.totalUsd).toBeCloseTo(10, 6)
    expect(partnerTotalUsd).toBeCloseTo(18, 6)
  })

  test('treats null partnerFeeUsd/volumeUsd as zero', () => {
    const { byPartner } = aggregatePartnerRevenue([swap({ partnerFeeUsd: null, volumeUsd: null })])
    expect(byPartner.alpha.totalUsd).toBe(0)
    expect(byPartner.alpha.totalVolumeUsd).toBe(0)
    expect(byPartner.alpha.swapCount).toBe(1)
  })
})
