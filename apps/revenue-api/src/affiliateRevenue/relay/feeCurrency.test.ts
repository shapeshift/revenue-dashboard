import { describe, expect, test } from 'bun:test'

import { inferFeeCurrency, resolveFeeCurrency } from './feeCurrency'
import type { AppFee, AppFees, CurrencyObject, Route } from './types'

const currency = (symbol: string): CurrencyObject => ({
  chainId: 1,
  address: `0x${symbol}`,
  symbol,
  name: symbol,
  decimals: 18,
})
const fee = (amount: string, bps = '55', amountUsd?: string): AppFee => ({
  recipient: '0xdao',
  bps,
  amount,
  amountFormatted: '',
  amountUsd,
})
const route = (originIn: string, originOut: string, destOut?: string): Route => ({
  origin: {
    inputCurrency: { currency: currency('IN'), amount: originIn },
    outputCurrency: { currency: currency('MID'), amount: originOut },
  },
  destination: destOut ? { outputCurrency: { currency: currency('OUT'), amount: destOut } } : null,
})

describe('inferFeeCurrency', () => {
  // amounts from requests 0x699e7727 and 0xd62d6241, which Relay returns without appFees.currency
  test('names the leg the fee was taken from', () => {
    expect(inferFeeCurrency(route('40000000', '40476856815'), fee('220000'))?.symbol).toBe('IN')
    expect(
      inferFeeCurrency(route('29820010066270000000000', '142356483056748094127449'), fee('782960656812114517700'))
        ?.symbol
    ).toBe('MID')
  })

  test('prefers the closest leg when two are within tolerance', () => {
    expect(inferFeeCurrency(route('1005000', '1000000'), fee('5527'))?.symbol).toBe('IN')
    expect(inferFeeCurrency(route('1000000', '1005000'), fee('5527'))?.symbol).toBe('MID')
  })

  test('gives up on amounts that are not integers instead of throwing', () => {
    expect(inferFeeCurrency(route('1.5e21', '2000000'), fee('11000'))?.symbol).toBe('MID')
    expect(inferFeeCurrency(route('1000000', '2000000'), fee('12.3'))).toBeUndefined()
  })

  test('checks the destination legs too', () => {
    expect(inferFeeCurrency(route('1000000', '2000000', '3000000'), fee('16500'))?.symbol).toBe('OUT')
  })

  test('gives up when no leg accounts for the fee', () => {
    expect(inferFeeCurrency(route('1000000', '2000000'), fee('999'))).toBeUndefined()
    expect(inferFeeCurrency(route('1000000', '2000000'), fee('5500', '0'))).toBeUndefined()
    expect(inferFeeCurrency(undefined, fee('999'))).toBeUndefined()
  })
})

describe('resolveFeeCurrency', () => {
  const appFees = (currency?: CurrencyObject): AppFees => ({ quoted: [], actual: [], currency })
  const swap = route('40000000', '40476856815')

  test("uses Relay's currency when it has one, priced or not", () => {
    expect(resolveFeeCurrency(appFees(currency('RELAY')), swap, [fee('220000')])?.symbol).toBe('RELAY')
  })

  test('infers only when Relay priced every fee', () => {
    expect(resolveFeeCurrency(appFees(), swap, [fee('220000', '55', '0.22')])?.symbol).toBe('IN')
    expect(resolveFeeCurrency(appFees(), swap, [fee('220000')])).toBeUndefined()
    expect(resolveFeeCurrency(appFees(), swap, [fee('220000', '55', '0')])).toBeUndefined()
    expect(resolveFeeCurrency(appFees(), swap, [fee('220000', '55', '0.22'), fee('220000')])).toBeUndefined()
    expect(resolveFeeCurrency(appFees(), swap, [])).toBeUndefined()
  })
})
