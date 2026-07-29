import { describe, expect, test } from 'bun:test'

import { affiliateFeeUsd, parseOrderTimeMs, selectAffiliateFee } from './butterswap'
import { BUTTERSWAP_AFFILIATE_ID, SAME_CHAIN_FEE_RECEIVERS, SAME_CHAIN_ROUTERS } from './constants'
import { extractFee } from './resolveFee'
import type { AffiliateFee, ButterSwapTransaction } from './types'

const MAP_USDC = {
  chainId: 22776,
  address: '0x9f722b2cb30093f766221fd0d37964949ed66918',
  decimals: 18,
  symbol: 'USDC',
}
const MAP_ETH = {
  chainId: 22776,
  address: '0x05ab928d446d8ce6761e368c8e7be03c3168a9ec',
  decimals: 18,
  symbol: 'ETH',
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

describe('selectAffiliateFee', () => {
  test('picks our row out of the per-affiliate rows (ids arrive as strings)', () => {
    expect(selectAffiliateFee(tx(), BUTTERSWAP_AFFILIATE_ID)?.fee).toBe('869453514000000000')
  })

  test('no row for us → null', () => {
    expect(
      selectAffiliateFee(tx({ affiliateFees: [feeRow({ affiliateId: '9' })] }), BUTTERSWAP_AFFILIATE_ID)
    ).toBeNull()
    expect(selectAffiliateFee(tx({ affiliateFees: [] }), BUTTERSWAP_AFFILIATE_ID)).toBeNull()
    expect(selectAffiliateFee(tx({ affiliateFees: undefined }), BUTTERSWAP_AFFILIATE_ID)).toBeNull()
  })
})

describe('affiliateFeeUsd', () => {
  test('matches the API-reported USD for a mapped-USDC fee (order 960412: $0.869387)', () => {
    expect(affiliateFeeUsd(feeRow())).toBeCloseTo(869387 / 1e6, 6)
  })

  test('matches for a non-stablecoin fee token (order 953704: 0.0003 mETH @ $1807.01 = $0.542102)', () => {
    const row = feeRow({ token: MAP_ETH, fee: '300000000000000', price: '1807005969' })
    expect(affiliateFeeUsd(row)).toBeCloseTo(542102 / 1e6, 6)
  })

  test('0bps order → $0', () => {
    expect(affiliateFeeUsd(feeRow({ rate: '0', fee: '0' }))).toBe(0)
  })
})

const [ROUTER] = [...SAME_CHAIN_ROUTERS]
const RECEIVERS = SAME_CHAIN_FEE_RECEIVERS
const NEW_RECEIVER = '0xf5aa59151be6515c4ca68a0282cf68b3ea4846fc'
const OLD_RECEIVER = '0x35339070f178dc4119732982c23f5a8d88d3f8a3'
const FEE_TOKEN = '0xdac17f958d2ee523a2206206994597c13d831ec7' // USDT
const OTHER = '0x1111111111111111111111111111111111111111'

describe('extractFee', () => {
  test('sums router→receiver transfers, filtering by contract when given (ERC20)', () => {
    const transfers = [
      { contract: FEE_TOKEN, from: OTHER, to: ROUTER, value: '850689058' }, // input leg, not a fee
      { contract: FEE_TOKEN, from: ROUTER, to: NEW_RECEIVER, value: '5104134' }, // the fee
      { contract: OTHER, from: ROUTER, to: NEW_RECEIVER, value: '999' }, // wrong token
    ]
    expect(extractFee(transfers, SAME_CHAIN_ROUTERS, RECEIVERS, FEE_TOKEN)).toBe(5104134n)
  })

  test('matches the rotated receiver and is case-insensitive (native, no token filter)', () => {
    const internal = [{ from: ROUTER.toUpperCase(), to: OLD_RECEIVER.toUpperCase(), value: '480653011669439900' }]
    expect(extractFee(internal, SAME_CHAIN_ROUTERS, RECEIVERS)).toBe(480653011669439900n)
  })

  test('no transfer to a known receiver → 0', () => {
    expect(extractFee([{ from: ROUTER, to: OTHER, value: '9' }], SAME_CHAIN_ROUTERS, RECEIVERS)).toBe(0n)
  })
})
