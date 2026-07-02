import { describe, expect, test } from 'bun:test'

import type { Fees } from '../index'

import { buildSettlement } from './settle'
import type { PartnerSwapRow } from './types'

const fee = (over: Partial<Fees>): Fees => ({
  amount: '0',
  amountUsd: '0',
  assetId: 'eip155:1/slip44:60',
  chainId: 'eip155:1',
  service: 'thorchain',
  timestamp: 1_780_000_000,
  txHash: '0xabc',
  ...over,
})

const swap = (over: Partial<PartnerSwapRow>): PartnerSwapRow => ({
  partnerCode: 'alpha',
  swapperName: 'THORChain',
  sellTxHash: '0xABC',
  buyTxHash: null,
  partnerBps: 50,
  affiliateBps: 60,
  feeUsd: 6,
  partnerFeeUsd: 5,
  volumeUsd: 1000,
  date: '2026-06-01',
  ...over,
})

describe('buildSettlement — matched fee event', () => {
  test('splits a matched fee by partnerBps/affiliateBps (provider USD is source of truth)', () => {
    const fees = [fee({ txHash: '0xABC', amountUsd: '6' })] // note case differs from swap.sellTxHash
    const res = buildSettlement(fees, [swap({})])

    // partner share = 6 * 50/60 = 5; shapeshift keeps 1
    expect(Number(res.netFees[0].amountUsd)).toBeCloseTo(1, 6)
    expect(res.byPartner.alpha.totalUsd).toBeCloseTo(5, 6)
    expect(res.byPartner.alpha.byService.THORChain).toBeCloseTo(5, 6)
    expect(res.byPartner.alpha.byDate['2026-06-01']).toBeCloseTo(5, 6)
    expect(res.byPartner.alpha.totalVolumeUsd).toBeCloseTo(1000, 6)
    expect(res.byPartner.alpha.swapCount).toBe(1)
    expect(res.partnerTotalUsd).toBeCloseTo(5, 6)
    expect(res.unreconciled).toEqual({ count: 0, usd: 0 })
    // conservation: net + partner == gross
    expect(Number(res.netFees[0].amountUsd) + res.partnerTotalUsd).toBeCloseTo(6, 6)
  })

  test('does not split when affiliateBps <= 0', () => {
    const fees = [fee({ txHash: '0xABC', amountUsd: '6' })]
    const res = buildSettlement(fees, [swap({ affiliateBps: 0 })])
    expect(Number(res.netFees[0].amountUsd)).toBeCloseTo(6, 6)
    expect(res.partnerTotalUsd).toBe(0)
  })

  test('clamps the partner ratio to 1 when partnerBps > affiliateBps', () => {
    const fees = [fee({ txHash: '0xABC', amountUsd: '6' })]
    const res = buildSettlement(fees, [swap({ partnerBps: 80, affiliateBps: 60 })])

    // rate = min(80/60, 1) = 1, so partner share is the full 6, net is 0 (not negative)
    expect(res.byPartner.alpha.totalUsd).toBeCloseTo(6, 6)
    expect(Number(res.netFees[0].amountUsd)).toBe(0)
  })
})

describe('buildSettlement — unmatched fallback', () => {
  test('emits a synthetic negative fee on the mapped service and flags unreconciled', () => {
    // chainflip fee event carries no txHash => cannot match
    const fees = [fee({ service: 'chainflip', txHash: '', amountUsd: '5' })]
    const s = swap({ swapperName: 'Chainflip', sellTxHash: null, buyTxHash: null, partnerFeeUsd: 4, feeUsd: 5 })
    const res = buildSettlement(fees, [s])

    const synthetic = res.netFees.find(f => f.synthetic)
    expect(synthetic).toBeDefined()
    expect(synthetic!.service).toBe('chainflip')
    expect(Number(synthetic!.amountUsd)).toBeCloseTo(-4, 6)
    expect(res.byPartner.alpha.totalUsd).toBeCloseTo(4, 6)
    expect(res.unreconciled).toEqual({ count: 1, usd: 4 })
  })

  test('unmapped swapper: no synthetic fee, still reported in byPartner', () => {
    const s = swap({ swapperName: 'Across', sellTxHash: null, buyTxHash: null, partnerFeeUsd: 3 })
    const res = buildSettlement([], [s])
    expect(res.netFees.find(f => f.synthetic)).toBeUndefined()
    expect(res.byPartner.alpha.totalUsd).toBeCloseTo(3, 6)
    expect(res.unreconciled).toEqual({ count: 1, usd: 3 })
  })
})
