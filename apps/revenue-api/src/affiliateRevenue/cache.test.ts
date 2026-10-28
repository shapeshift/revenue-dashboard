import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import { getCacheableThreshold } from './cache'
import { STREAMING_SWAP_SETTLE_SECONDS } from './constants'

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000)

describe('getCacheableThreshold', () => {
  afterEach(() => setSystemTime())

  test('caches yesterday once the default settle delay has passed', () => {
    setSystemTime(new Date('2026-10-28T00:20:00Z'))
    expect(getCacheableThreshold()).toBe(at('2026-10-28T00:00:00Z'))
  })

  // a streaming swap started late yesterday may not have paid out yet
  test('holds back the last day until streaming swaps can have completed', () => {
    setSystemTime(new Date('2026-10-28T12:00:00Z'))
    expect(getCacheableThreshold(STREAMING_SWAP_SETTLE_SECONDS)).toBe(at('2026-10-27T00:00:00Z'))
    setSystemTime(new Date('2026-10-29T02:30:00Z'))
    expect(getCacheableThreshold(STREAMING_SWAP_SETTLE_SECONDS)).toBe(at('2026-10-28T00:00:00Z'))
  })
})
