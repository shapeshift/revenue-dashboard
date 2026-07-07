import { describe, expect, test } from 'bun:test'

import type { Asset } from '../assetData/types'

import { aggregateAffiliateRevenue, aggregatePartnerRevenue } from './aggregateRevenue'
import type { ResolveAsset } from './aggregateRevenue'
import type { PartnerSwap, Fees } from './types'

const ETH = 'eip155:1/slip44:60'

const ethAsset: Asset = {
  assetId: ETH,
  chainId: 'eip155:1',
  symbol: 'ETH',
  name: 'Ethereum',
  precision: 18,
  color: '',
  icon: '',
}

const resolveAsset: ResolveAsset = assetId => Promise.resolve(assetId === ETH ? ethAsset : undefined)

const fee = (over: Partial<Fees>): Fees => ({
  amount: '0',
  amountUsd: '0',
  assetId: ETH,
  chainId: 'eip155:1',
  service: 'thorchain',
  timestamp: 1_780_000_000,
  txHash: '0xabc',
  ...over,
})

// A $10 / 1 ETH gross fee and the -$4 / -0.4 ETH partner adjustment that nets it (as reconcile emits).
const grossFee = fee({ amount: '1000000000000000000', amountUsd: '10' })
const partnerAdjustment = fee({ synthetic: true, amount: '-400000000000000000', amountUsd: '-4' })

describe('aggregateAffiliateRevenue', () => {
  test('nets the synthetic partner adjustment out of USD, crypto, and per-asset totals', async () => {
    const res = await aggregateAffiliateRevenue([grossFee, partnerAdjustment], [], resolveAsset)

    expect(res.totalUsd).toBeCloseTo(6, 6) // 10 - 4
    expect(res.byService.thorchain).toBeCloseTo(6, 6)

    const asset = res.byAsset![ETH]
    expect(asset.amountUsd).toBeCloseTo(6, 6)
    expect(Number(asset.tokenAmount)).toBeCloseTo(0.6, 9) // 1 - 0.4 ETH
    expect(asset.symbol).toBe('ETH')
    expect(asset.chainName).toBe('Ethereum')
  })

  test('excludes synthetic adjustments from fee counts while counting real fees', async () => {
    const res = await aggregateAffiliateRevenue([grossFee, partnerAdjustment], [], resolveAsset)

    expect(res.totalFeeCount).toBe(1)
    expect(res.byServiceFeeCount.thorchain).toBe(1)
    expect(res.byAsset![ETH].feeCount).toBe(1)
  })

  test('per-asset USD reconciles with totalUsd', async () => {
    const res = await aggregateAffiliateRevenue([grossFee, partnerAdjustment], [], resolveAsset)

    const assetUsdSum = Object.values(res.byAsset!).reduce((sum, a) => sum + a.amountUsd, 0)
    expect(assetUsdSum).toBeCloseTo(res.totalUsd, 6)
  })

  test('floors a bucket below 0 to 0 — never negative revenue', async () => {
    const gross = fee({ amount: '1000000000000000000', amountUsd: '6' })
    const overDeduct = fee({ synthetic: true, amount: '-2000000000000000000', amountUsd: '-10' })

    const res = await aggregateAffiliateRevenue([gross, overDeduct], [], resolveAsset)

    expect(res.byService.thorchain).toBe(0) // 6 - 10 → floored
    expect(res.totalUsd).toBe(0)
    expect(res.byAsset![ETH].amountUsd).toBe(0)
    expect(Number(res.byAsset![ETH].tokenAmount)).toBe(0) // 1 - 2 ETH → floored
  })

  test('passes failedProviders through unchanged', async () => {
    const res = await aggregateAffiliateRevenue([], ['bebop', 'zrx'], resolveAsset)

    expect(res.failedProviders).toEqual(['bebop', 'zrx'])
    expect(res.totalUsd).toBe(0)
    expect(res.totalFeeCount).toBe(0)
  })
})

const partnerSwap = (over: Partial<PartnerSwap>): PartnerSwap => ({
  swapId: 'swap-1',
  status: 'SUCCESS',
  partnerCode: 'alpha',
  swapperName: 'THORChain',
  sellTxHash: null,
  buyTxHash: null,
  partnerBps: 30,
  affiliateBps: 60,
  verifiedBps: 60,
  feeUsd: '6', // == bps-implied (1000 × 60 / 10000), no anomaly
  partnerFeeUsd: '3',
  volumeUsd: '1000',
  affiliateFeeAssetId: ETH,
  affiliateFeeAmountCryptoBaseUnit: '1000000000000000000',
  date: '2026-06-01',
  ...over,
})

describe('aggregatePartnerRevenue', () => {
  test('counts only payable swaps; excludes non-payable ones with an audit entry', () => {
    const { response, excluded } = aggregatePartnerRevenue(
      [
        partnerSwap({ partnerFeeUsd: '3' }), // payable
        partnerSwap({ swapId: 'swap-2', status: 'PENDING', partnerFeeUsd: '9' }), // not on-chain settled
      ],
      []
    )

    const alpha = response.byPartner['alpha']
    expect(alpha.swapCount).toBe(1) // the pending swap is excluded entirely
    expect(alpha.totalUsd).toBeCloseTo(3, 6)
    expect(response.partnerTotalUsd).toBeCloseTo(3, 6)

    expect(excluded).toHaveLength(1)
    expect(excluded[0].swapId).toBe('swap-2')
    expect(excluded[0].reason).toContain('not SUCCESS')
  })

  test('aggregates payable swaps by partner, service, and date', () => {
    const { response } = aggregatePartnerRevenue(
      [
        partnerSwap({ partnerCode: 'alpha', swapperName: 'THORChain', partnerFeeUsd: '3', date: '2026-06-01' }),
        partnerSwap({ swapId: 's2', partnerCode: 'alpha', swapperName: '0x', partnerFeeUsd: '2', date: '2026-06-02' }),
        partnerSwap({
          swapId: 's3',
          partnerCode: 'beta',
          swapperName: 'THORChain',
          partnerFeeUsd: '7',
          date: '2026-06-01',
        }),
      ],
      []
    )

    const alpha = response.byPartner['alpha']
    expect(alpha.swapCount).toBe(2)
    expect(alpha.totalUsd).toBeCloseTo(5, 6)
    expect(alpha.byService['THORChain']).toBeCloseTo(3, 6)
    expect(alpha.byService['0x']).toBeCloseTo(2, 6)
    expect(alpha.byDate['2026-06-01']).toBeCloseTo(3, 6)
    expect(alpha.byDate['2026-06-02']).toBeCloseTo(2, 6)

    expect(response.byPartner['beta'].totalUsd).toBeCloseTo(7, 6)
    expect(response.partnerTotalUsd).toBeCloseTo(12, 6)
  })

  test('includes volumeUsd for payable swaps (parsed via BigNumber)', () => {
    const { response } = aggregatePartnerRevenue([partnerSwap({ partnerFeeUsd: '3.5', volumeUsd: '1234.56' })], [])

    const alpha = response.byPartner['alpha']
    expect(alpha.totalUsd).toBeCloseTo(3.5, 6)
    expect(alpha.totalVolumeUsd).toBeCloseTo(1234.56, 6)
  })

  test('passes the affiliate registry through unchanged', () => {
    const affiliates = [{ partnerCode: 'alpha', bps: 30, isActive: true }]
    const { response, excluded } = aggregatePartnerRevenue([], affiliates)

    expect(response.affiliates).toEqual(affiliates)
    expect(response.byPartner).toEqual({})
    expect(response.partnerTotalUsd).toBe(0)
    expect(excluded).toEqual([])
  })
})
