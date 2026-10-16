import { describe, expect, test } from 'bun:test'

import { findBlockByTimestamp } from './findBlockByTimestamp'

// A chain as a list of block timestamps, counting header lookups
const chain = (timestamps: number[]) => {
  let lookups = 0
  const getBlockTimestamp = (block: number) => {
    lookups++
    return Promise.resolve(timestamps[block])
  }
  return { getBlockTimestamp, latest: timestamps.length - 1, lookups: () => lookups }
}

const expected = (timestamps: number[], target: number) => {
  let last = 0
  timestamps.forEach((ts, block) => {
    if (ts <= target) last = block
  })
  return last
}

const steady = Array.from({ length: 2_000_000 }, (_, i) => 1_600_000_000 + i * 2)
const withPause = [
  ...Array.from({ length: 500_000 }, (_, i) => 1_600_000_000 + i * 12),
  ...Array.from({ length: 500_000 }, (_, i) => 1_700_000_000 + i),
]
const zeroGenesis = [0, ...Array.from({ length: 999_999 }, (_, i) => 1_600_000_000 + i * 3)]

describe('findBlockByTimestamp', () => {
  test('is exact on every chain shape, including targets between blocks', async () => {
    for (const timestamps of [steady, withPause, zeroGenesis]) {
      for (const block of [1, 2, 12_345, 499_999, 500_000, 777_777, timestamps.length - 2]) {
        for (const target of [timestamps[block], timestamps[block] + 1]) {
          const c = chain(timestamps)
          expect(await findBlockByTimestamp(c.getBlockTimestamp, c.latest, target)).toBe(expected(timestamps, target))
        }
      }
    }
  })

  test('resolves a timestamp past the head to the latest block', async () => {
    const c = chain(steady)
    expect(await findBlockByTimestamp(c.getBlockTimestamp, c.latest, steady[c.latest] + 86_400)).toBe(c.latest)
    expect(c.lookups()).toBe(1)
  })

  test('resolves a timestamp before genesis to block 0', async () => {
    const c = chain(steady)
    expect(await findBlockByTimestamp(c.getBlockTimestamp, c.latest, steady[0] - 1)).toBe(0)
  })

  test('needs a handful of lookups on steady block times', async () => {
    const c = chain(steady)
    await findBlockByTimestamp(c.getBlockTimestamp, c.latest, steady[1_234_567])
    expect(c.lookups()).toBeLessThanOrEqual(6)
  })

  test('stays logarithmic when block times change', async () => {
    const c = chain(withPause)
    await findBlockByTimestamp(c.getBlockTimestamp, c.latest, withPause[499_999] + 5)
    expect(c.lookups()).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(withPause.length)) + 2)
  })
})
