import { describe, expect, test } from 'bun:test'

import { SOLANA_CHAIN_ID } from '../constants'

import type { Trade } from './types'
import { isChargedTrade, nextPageEnd, toChainId } from './utils'

const trade = (over: Partial<Trade> = {}): Trade => ({
  chain_id: 1,
  txHash: '0xabc',
  status: 'Success',
  type: 'Swap',
  taker: '0x1',
  receiver: '0x1',
  sellTokens: {},
  buyTokens: {},
  timestamp: '2026-10-21 02:24:35Z',
  route: 'PMM',
  gasless: false,
  partnerFeeNative: '0.0012',
  partnerFeeBps: '55',
  ...over,
})

describe('toChainId', () => {
  test('Bebop chain id 2 is Solana, not eip155:2', () => {
    expect(toChainId(2)).toBe(SOLANA_CHAIN_ID)
  })

  test('other ids are EVM chain ids', () => {
    expect(toChainId(8453)).toBe('eip155:8453')
  })
})

describe('isChargedTrade', () => {
  test('a settled trade with a fee is charged', () => {
    expect(isChargedTrade(trade())).toBe(true)
  })

  // "0.0" is truthy as a string
  test.each([
    ['"0.0" bps', { partnerFeeBps: '0.0' }],
    ['"0.0" fee', { partnerFeeNative: '0.0' }],
    ['missing fee', { partnerFeeNative: undefined }],
  ])('%s → not charged', (_label, over) => {
    expect(isChargedTrade(trade(over))).toBe(false)
  })

  test('only Success trades count', () => {
    expect(isChargedTrade(trade({ status: 'Pending' }))).toBe(false)
  })
})

describe('nextPageEnd', () => {
  const start = 1715000000000000000n
  const cursor = 1792000000000000000n

  test('follows the cursor back to the next (older) page', () => {
    expect(nextPageEnd('1747258600000000000', cursor, start)).toBe(1747258600000000000n)
  })

  test('stops when there is no next page or it falls before the window', () => {
    expect(nextPageEnd(undefined, cursor, start)).toBeUndefined()
    expect(nextPageEnd('1714999999999999999', cursor, start)).toBeUndefined()
  })

  // a cursor that doesn't move back would refetch the same page forever
  test('throws on a cursor that does not move back', () => {
    expect(() => nextPageEnd(cursor.toString(), cursor, start)).toThrow()
    expect(() => nextPageEnd((cursor + 1n).toString(), cursor, start)).toThrow()
  })
})
