import { describe, expect, test } from 'bun:test'

import { mapSwapperNameToService } from './swapperServiceMap'

describe('mapSwapperNameToService', () => {
  test('maps known swappers to dashboard service ids', () => {
    expect(mapSwapperNameToService('THORChain')).toBe('thorchain')
    expect(mapSwapperNameToService('0x')).toBe('zrx')
    expect(mapSwapperNameToService('CoW Swap')).toBe('cowswap')
    expect(mapSwapperNameToService('Relay')).toBe('relay')
    expect(mapSwapperNameToService('MAYAChain')).toBe('mayachain')
    expect(mapSwapperNameToService('NEAR Intents')).toBe('nearintents')
    expect(mapSwapperNameToService('AVNU')).toBe('avnu')
  })

  test('returns null for swappers the dashboard does not track', () => {
    expect(mapSwapperNameToService('Across')).toBeNull()
    expect(mapSwapperNameToService('ArbitrumBridge')).toBeNull()
    expect(mapSwapperNameToService('Unknown')).toBeNull()
    // Documents that exact string match matters: the old (wrong) casing must not resolve.
    expect(mapSwapperNameToService('Mayachain')).toBeNull()
  })
})
