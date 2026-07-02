import { describe, expect, test } from 'bun:test'
import { fetchPartnerSwaps } from './swapServiceClient'

const makeFetch = (pages: any[]) => {
  let i = 0
  return async () => ({ ok: true, json: async () => pages[i++] }) as unknown as Response
}

describe('fetchPartnerSwaps', () => {
  test('follows the cursor and maps enriched swap rows', async () => {
    const fakeFetch = makeFetch([
      {
        swaps: [{
          partnerCode: 'alpha', swapperName: 'THORChain', sellTxHash: '0xA', buyTxHash: null,
          partnerBps: 50, affiliateBps: 60, feeUsd: 6, partnerFeeUsd: 5, volumeUsd: 1000,
          createdAt: '2026-06-01T12:00:00.000Z',
        }],
        nextCursor: 'c1',
      },
      { swaps: [], nextCursor: null },
    ])

    const rows = await fetchPartnerSwaps('2026-06-01', '2026-06-02', { fetchImpl: fakeFetch })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ partnerCode: 'alpha', swapperName: 'THORChain', date: '2026-06-01' })
  })
})
