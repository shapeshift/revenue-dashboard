import { describe, expect, test } from 'bun:test'

import { reconcilePartnerRevenue } from './reconcileRevenue'
import type { PartnerSwap, Fees } from './types'

const fee = (over: Partial<Fees>): Fees => ({
  amount: '1000000000000000000',
  amountUsd: '6',
  assetId: 'eip155:1/slip44:60',
  chainId: 'eip155:1',
  service: 'thorchain',
  timestamp: 1_780_000_000,
  txHash: '0xabc',
  ...over,
})

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
  feeUsd: '6', // == bps-implied, no anomaly
  partnerFeeUsd: '3',
  volumeUsd: '1000',
  affiliateFeeAssetId: 'eip155:1/slip44:60',
  affiliateFeeAmountCryptoBaseUnit: '1000000000000000000',
  date: '2026-06-01',
  ...over,
})

describe('reconcilePartnerRevenue — payable swap', () => {
  test('passes gross through and deducts the payable share (USD + on-chain crypto)', () => {
    const gross = fee({})
    const res = reconcilePartnerRevenue([gross], [swap({})], [])

    expect(res.netFees[0]).toEqual(gross) // gross untouched

    const adj = res.netFees.find(f => f.synthetic)!
    expect(Number(adj.amountUsd)).toBeCloseTo(-3, 6)
    expect(adj.amount).toBe('-500000000000000000') // 1e18 × 30/60, negated
    expect(adj.assetId).toBe('eip155:1/slip44:60')
    expect(adj.chainId).toBe('eip155:1')
    expect(adj.service).toBe('thorchain')
    expect(res.excluded).toEqual([])
  })

  test('crypto share uses verifiedBps, not creation-time affiliateBps', () => {
    const res = reconcilePartnerRevenue([], [swap({ affiliateBps: 999 })], [])
    expect(res.netFees.find(f => f.synthetic)!.amount).toBe('-500000000000000000')
  })
})

describe('reconcilePartnerRevenue — excluded (audited, not deducted)', () => {
  const expectExcluded = (over: Partial<PartnerSwap>, reasonMatch: string) => {
    const res = reconcilePartnerRevenue([], [swap(over)], [])
    expect(res.netFees.find(f => f.synthetic)).toBeUndefined()
    expect(res.excluded).toHaveLength(1)
    expect(res.excluded[0].swapId).toBe('swap-1')
    expect(res.excluded[0].reason).toContain(reasonMatch)
  }

  test('non-SUCCESS swap', () => expectExcluded({ status: 'PENDING' }, 'not SUCCESS'))
  test('no on-chain affiliate fee amount', () =>
    expectExcluded({ affiliateFeeAmountCryptoBaseUnit: null }, 'no on-chain'))
  test('no verified bps', () => expectExcluded({ verifiedBps: null }, 'no verified'))
  test('fee anomaly', () => expectExcluded({ feeUsd: '100', partnerFeeUsd: '50' }, 'anomaly'))
  test('unmapped swapper', () => expectExcluded({ swapperName: 'Across' }, 'unmapped swapper'))

  test('provider that failed this run (would deduct against missing gross)', () => {
    const res = reconcilePartnerRevenue([], [swap({})], ['thorchain'])
    expect(res.netFees.find(f => f.synthetic)).toBeUndefined()
    expect(res.excluded[0].reason).toContain('provider thorchain failed')
  })

  test('zero-partner-fee swaps are ignored silently (not excluded, not deducted)', () => {
    const res = reconcilePartnerRevenue([], [swap({ partnerFeeUsd: '0' })], [])
    expect(res.netFees.find(f => f.synthetic)).toBeUndefined()
    expect(res.excluded).toEqual([])
  })
})
