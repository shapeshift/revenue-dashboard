import { describe, expect, test } from 'bun:test'

import type { Fees } from '../affiliateRevenue/index'

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
  test('peels the partner bps share from a matched fee (provider USD is source of truth)', () => {
    const fees = [fee({ txHash: '0xABC', amountUsd: '6' })] // note case differs from swap.sellTxHash
    const res = buildSettlement(fees, [swap({})])

    // partner share = 6 * min(50/60, 1) = 5; ShapeShift keeps 1
    expect(Number(res.netFees[0].amountUsd)).toBeCloseTo(1, 6)
    expect(res.unreconciled).toEqual({ count: 0, usd: 0 })
  })

  test('does not peel when affiliateBps <= 0', () => {
    const fees = [fee({ txHash: '0xABC', amountUsd: '6' })]
    const res = buildSettlement(fees, [swap({ affiliateBps: 0 })])
    expect(Number(res.netFees[0].amountUsd)).toBeCloseTo(6, 6)
    expect(res.unreconciled).toEqual({ count: 0, usd: 0 })
  })

  test('clamps the partner ratio to 1 when partnerBps > affiliateBps (net never negative)', () => {
    const fees = [fee({ txHash: '0xABC', amountUsd: '6' })]
    const res = buildSettlement(fees, [swap({ partnerBps: 80, affiliateBps: 60 })])

    // rate = min(80/60, 1) = 1, so the full 6 is peeled and net is 0 (not negative)
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
    expect(res.unreconciled).toEqual({ count: 1, usd: 4 })
  })

  test('unmapped swapper: no synthetic fee, still counted as unreconciled', () => {
    const s = swap({ swapperName: 'Across', sellTxHash: null, buyTxHash: null, partnerFeeUsd: 3 })
    const res = buildSettlement([], [s])
    expect(res.netFees.find(f => f.synthetic)).toBeUndefined()
    expect(res.unreconciled).toEqual({ count: 1, usd: 3 })
  })
})
