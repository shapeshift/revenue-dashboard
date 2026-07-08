import { describe, expect, test } from 'bun:test'

import { getPayablePartnerFee } from './payablePartnerFee'
import type { PartnerSwap } from './types'

const swap = (over: Partial<PartnerSwap>): PartnerSwap => ({
  swapId: 'swap-1',
  status: 'SUCCESS',
  partnerCode: 'alpha',
  swapperName: 'THORChain',
  sellTxHash: null,
  buyTxHash: null,
  partnerBps: 30,
  affiliateBps: 60,
  verifiedBps: 60,
  feeUsd: '6', // == bps-implied (1000 × 60 / 10000), so no anomaly
  partnerFeeUsd: '3', // = feeUsd × 30/60
  volumeUsd: '1000',
  affiliateFeeAssetId: 'eip155:1/slip44:60',
  affiliateFeeAmountCryptoBaseUnit: '1000000000000000000',
  date: '2026-06-01',
  ...over,
})

describe('getPayablePartnerFee', () => {
  test('payable: verified on-chain swap with a real affiliate fee', () => {
    const res = getPayablePartnerFee(swap({}))
    expect(res.payable).toBe(true)
    if (res.payable) {
      expect(res.partnerFeeUsd).toBeCloseTo(3, 6)
      expect(res.partnerFeeCryptoBaseUnit).toBe('500000000000000000') // 1e18 × 30/60
      expect(res.assetId).toBe('eip155:1/slip44:60')
    }
  })

  test('crypto share uses verifiedBps, not creation-time affiliateBps', () => {
    const res = getPayablePartnerFee(swap({ affiliateBps: 999 }))
    expect(res.payable).toBe(true)
    if (res.payable) expect(res.partnerFeeCryptoBaseUnit).toBe('500000000000000000')
  })

  test('clamps the crypto share to the total when partnerBps > verifiedBps', () => {
    // 1e18 × 120/60 = 2e18, clamped to the 1e18 total
    const res = getPayablePartnerFee(swap({ partnerBps: 120, verifiedBps: 60, feeUsd: '6', partnerFeeUsd: '6' }))
    expect(res.payable).toBe(true)
    if (res.payable) expect(res.partnerFeeCryptoBaseUnit).toBe('1000000000000000000')
  })

  test.each([
    ['swap not SUCCESS', swap({ status: 'PENDING' })],
    ['no affiliate-fee asset', swap({ affiliateFeeAssetId: null })],
    ['no on-chain affiliate-fee amount', swap({ affiliateFeeAmountCryptoBaseUnit: null })],
    ['no verified on-chain bps', swap({ verifiedBps: null })],
    ['invalid partner bps', swap({ partnerBps: -30 })],
    ['no partner fee', swap({ partnerFeeUsd: '0' })],
  ])('not payable: %s', (reason, s) => {
    const res = getPayablePartnerFee(s)
    expect(res.payable).toBe(false)
    if (!res.payable) expect(res.reason).toBe(reason)
  })

  test('not payable: on-chain fee deviates too far from bps-implied (anomaly)', () => {
    // implied = 1000 × 60 / 10000 = 6; feeUsd 100 is wildly off
    const res = getPayablePartnerFee(swap({ feeUsd: '100', partnerFeeUsd: '50' }))
    expect(res.payable).toBe(false)
    if (!res.payable) expect(res.reason).toContain('anomaly')
  })

  test('payable with $0: verified on-chain with a genuine 0 affiliate bps', () => {
    // A real settled swap whose verified affiliate bps is 0 earned nothing for anyone. It's payable
    // (so it still counts as a swap) but contributes $0 — even when the fee asset/amount are absent,
    // which is expected when nothing was collected. Distinct from verifiedBps null (never verified).
    const res = getPayablePartnerFee(
      swap({
        verifiedBps: 0,
        feeUsd: '0',
        partnerFeeUsd: '0',
        affiliateFeeAssetId: null,
        affiliateFeeAmountCryptoBaseUnit: null,
      })
    )
    expect(res.payable).toBe(true)
    if (res.payable) {
      expect(res.partnerFeeUsd).toBe(0)
      expect(res.partnerFeeCryptoBaseUnit).toBe('0')
    }
  })

  test('not payable: a malformed negative partner bps is rejected even when verifiedBps is 0', () => {
    const res = getPayablePartnerFee(swap({ verifiedBps: 0, partnerBps: -30, partnerFeeUsd: '0' }))
    expect(res.payable).toBe(false)
    if (!res.payable) expect(res.reason).toBe('invalid partner bps')
  })
})
