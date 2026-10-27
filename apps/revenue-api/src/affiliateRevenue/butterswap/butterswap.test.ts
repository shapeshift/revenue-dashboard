import { describe, expect, test } from 'bun:test'

import { crossChainFee, parseOrderTimeMs } from './butterswap'
import type { AffiliateFee, ButterSwapTransaction } from './types'

const MAP_USDC = {
  chainId: 22776,
  address: '0x9f722b2cb30093f766221fd0d37964949ed66918',
  decimals: 18,
  symbol: 'USDC',
}

// Order 960412 — ETH→SOL, "26:60|9:4", fee charged in mapped USDC. `fees.affiliate` = 869387 (6dec USD).
const feeRow = (over: Partial<AffiliateFee> = {}): AffiliateFee => ({
  affiliateId: '26',
  hash: '0x9fe4b9d7b2035e2af71216d0fa8671ff0150ad7fb31419fed620e7aeb39d33fe',
  orderId: '0x6f317af1cb9ec23205c7cd4ca04cd14c7d1cba335aae47091bbb4ec732aa2174',
  token: MAP_USDC,
  amount: '144908919000000000000',
  rate: '60',
  fee: '869453514000000000',
  price: '999924',
  completeTime: '2026-07-19T21:15:32.000Z',
  ...over,
})

const tx = (over: Partial<ButterSwapTransaction> = {}): ButterSwapTransaction => ({
  orderId: '0x6f317af1cb9ec23205c7cd4ca04cd14c7d1cba335aae47091bbb4ec732aa2174',
  affiliate: '26:60|9:4',
  affiliates: [
    { affiliateId: 26, rate: 60, name: 'shapeshift' },
    { affiliateId: 9, rate: 4, name: 'butterplus' },
  ],
  affiliateFees: [feeRow({ affiliateId: '9', rate: '4', fee: '57963567600000000' }), feeRow()],
  volume: '144897887',
  sendTime: '2026-07-19T21:12:11.000Z',
  raw: {
    relayState: 1,
    sourceChainId: '1',
    destinationChainId: '1360108768460801',
    sourceTime: '2026-07-19T21:12:11.000Z',
    sourceHash: '0xc634b97ba86195a84f1b583f1b8a326c7a83fd8fe420b583191555bf40c6668b',
    sourceTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    sourceAmount: '145000000',
  },
  ...over,
})

describe('parseOrderTimeMs', () => {
  test('parses the API ISO-8601 send time', () => {
    expect(parseOrderTimeMs('2026-07-19T21:12:11.000Z')).toBe(1784495531000)
  })

  test('passes epoch ms through', () => {
    expect(parseOrderTimeMs(1784495531000)).toBe(1784495531000)
  })

  test('missing or unparseable → NaN (order is skipped, never stamped 1970)', () => {
    expect(parseOrderTimeMs(undefined)).toBeNaN()
    expect(parseOrderTimeMs('')).toBeNaN()
    expect(parseOrderTimeMs('not a date')).toBeNaN()
  })
})

describe('crossChainFee', () => {
  test('builds the fee from our row, denominated in the row token on the MAP relay chain', () => {
    const fee = crossChainFee(tx(), 1784495531)

    expect(fee).toEqual({
      service: 'butterswap',
      amount: '869453514000000000',
      amountUsd: '0.8693874355329361',
      chainId: 'eip155:22776',
      assetId: `eip155:22776/erc20:${MAP_USDC.address}`,
      timestamp: 1784495531,
      txHash: feeRow().hash,
    })
  })

  // One malformed record must cost one order, not the batch: a throw here propagates out of
  // getFees, which marks the whole provider failed for the window.
  test('unparseable fee → skipped, not thrown', () => {
    const malformed = tx({ affiliateFees: [feeRow({ fee: '8.69e17' })] })

    expect(() => crossChainFee(malformed, 1784495531)).not.toThrow()
    expect(crossChainFee(malformed, 1784495531)).toBeNull()
  })

  test('0bps order → no fee', () => {
    expect(crossChainFee(tx({ affiliateFees: [feeRow({ rate: '0', fee: '0' })] }), 1784495531)).toBeNull()
  })

  test('no relay hash → never charged, so no fee', () => {
    expect(crossChainFee(tx({ affiliateFees: [feeRow({ hash: '' })] }), 1784495531)).toBeNull()
  })

  test('fee token off the MAP relay chain → skipped rather than mis-attributed', () => {
    const offChain = tx({ affiliateFees: [feeRow({ token: { ...MAP_USDC, chainId: 1 } })] })

    expect(crossChainFee(offChain, 1784495531)).toBeNull()
  })

  test('no row for us → no fee', () => {
    expect(crossChainFee(tx({ affiliateFees: [] }), 1784495531)).toBeNull()
  })

  // "NaN" would survive into aggregation, which parseFloats and sums it; "0" would understate the
  // fee wherever enrichment falls back to it. Neither belongs on a fee we know is nonzero.
  test.each([
    ['garbled price (NaN)', feeRow({ price: 'abc' })],
    ['empty price (0)', feeRow({ price: '' })],
    ['missing decimals (NaN)', feeRow({ token: { ...MAP_USDC, decimals: undefined as unknown as number } })],
  ])('%s → fee kept, USD left for enrichment', (_label, row) => {
    const fee = crossChainFee(tx({ affiliateFees: [row] }), 1784495531)

    expect(fee?.amount).toBe('869453514000000000')
    expect(fee?.amountUsd).toBeUndefined()
  })
})
