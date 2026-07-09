import { describe, expect, test } from 'bun:test'

import { computeFeeBaseUnits, parseAffiliateBps } from './butterswap'
import { SAME_CHAIN_FEE_RECEIVERS, SAME_CHAIN_ROUTERS } from './constants'
import { extractFee } from './resolveFee'

const AFF = 26
// A current + an older receiver, and a router, drawn from the real sets.
const [ROUTER] = [...SAME_CHAIN_ROUTERS]
const RECEIVERS = SAME_CHAIN_FEE_RECEIVERS
const NEW_RECEIVER = '0xf5aa59151be6515c4ca68a0282cf68b3ea4846fc'
const OLD_RECEIVER = '0x35339070f178dc4119732982c23f5a8d88d3f8a3'

describe('parseAffiliateBps', () => {
  test('extracts our affiliate rate from a multi-affiliate string', () => {
    expect(parseAffiliateBps('26:60|9:4', AFF)).toBe(60)
    expect(parseAffiliateBps('9:4|26:60', AFF)).toBe(60)
  })

  test('zero rate for our id → 0 (same-chain swaps report 26:0)', () => {
    expect(parseAffiliateBps('26:0|9:6', AFF)).toBe(0)
  })

  test('our id absent → 0', () => {
    expect(parseAffiliateBps('9:6', AFF)).toBe(0)
    expect(parseAffiliateBps('', AFF)).toBe(0)
    expect(parseAffiliateBps(undefined, AFF)).toBe(0)
  })
})

describe('computeFeeBaseUnits (cross-chain, USDT-denominated)', () => {
  test('matches the reconciled example: volume 1033478727 @ 60bps = $6.2009', () => {
    expect(computeFeeBaseUnits('1033478727', 60)).toBe(6200872362000000000n)
  })

  test('no float overflow on large volumes ($44.8k)', () => {
    expect(computeFeeBaseUnits('44821541561', 60)).toBe(268929249366000000000n)
  })

  test('zero volume → 0', () => {
    expect(computeFeeBaseUnits('0', 60)).toBe(0n)
  })
})

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
