import { describe, expect, mock, test } from 'bun:test'

import type { Fees } from './types'

const priceCalls: [string, number][] = []
await mock.module('./historicalPrices', () => ({
  getHistoricalPriceUsd: (assetId: string, timestamp: number) => {
    priceCalls.push([assetId, timestamp])
    return Promise.resolve(assetId === 'unpriced' ? null : 2000)
  },
}))
await mock.module('../assetData/AssetDataService', () => ({
  assetDataService: {
    getAsset: (assetId: string) => Promise.resolve(assetId === 'unknown' ? undefined : { precision: 18 }),
  },
}))

const { enrichFeesWithUsdPrices } = await import('./enrichment')

const fee = (over: Partial<Fees> = {}): Fees => ({
  amount: '500000000000000000',
  assetId: 'eip155:1/slip44:60',
  chainId: 'eip155:1',
  service: 'across',
  timestamp: 1_790_000_000,
  txHash: '0xabc',
  ...over,
})

describe('enrichFeesWithUsdPrices', () => {
  test("keeps the provider's swap-time USD without pricing it", async () => {
    priceCalls.length = 0
    const [enriched] = await enrichFeesWithUsdPrices([fee({ amountUsd: '1234.5' })])
    expect(enriched.amountUsd).toBe('1234.5')
    expect(priceCalls).toHaveLength(0)
  })

  test('prices a fee without USD at its own timestamp', async () => {
    priceCalls.length = 0
    const [enriched] = await enrichFeesWithUsdPrices([fee()])
    expect(enriched.amountUsd).toBe('1000')
    expect(priceCalls).toEqual([['eip155:1/slip44:60', 1_790_000_000]])
  })

  test('a zero provider USD is treated as missing', async () => {
    const [enriched] = await enrichFeesWithUsdPrices([fee({ amountUsd: '0' })])
    expect(enriched.amountUsd).toBe('1000')
  })

  test('leaves USD unset when there is no price or no asset', async () => {
    const [noPrice, noAsset] = await enrichFeesWithUsdPrices([
      fee({ assetId: 'unpriced' }),
      fee({ assetId: 'unknown' }),
    ])
    expect(noPrice.amountUsd).toBeUndefined()
    expect(noAsset.amountUsd).toBeUndefined()
  })

  // fees come from the per-day cache, so enrichment must not write into those objects
  test('does not mutate the input fee', async () => {
    const input = fee()
    await enrichFeesWithUsdPrices([input])
    expect(input.amountUsd).toBeUndefined()
  })
})
