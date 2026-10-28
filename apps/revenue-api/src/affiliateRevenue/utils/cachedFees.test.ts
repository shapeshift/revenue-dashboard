import { describe, expect, test } from 'bun:test'

import { saveCachedFees } from '../cache'
import type { Fees } from '../types'

import { getCachedFees } from './cachedFees'

const day = (date: string) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000)
const fee = (date: string): Fees =>
  ({ amount: '1', assetId: 'a', chainId: 'test:gap', service: 'across', timestamp: day(date), txHash: date }) as Fees

describe('getCachedFees', () => {
  // the missing days are fetched as one span, which also returns the cached day between them
  test('a cached day between missing days is counted once', async () => {
    saveCachedFees('across', 'test:gap', '2026-01-02', [fee('2026-01-02')])
    const fetchRange = () => Promise.resolve(['2026-01-01', '2026-01-02', '2026-01-03'].map(fee))

    const { fees } = await getCachedFees(
      'across',
      'test:gap',
      day('2026-01-01') - 43200,
      day('2026-01-03') + 43199,
      fetchRange
    )

    expect(fees.map(f => f.txHash).sort()).toEqual(['2026-01-01', '2026-01-02', '2026-01-03'])
  })
})
