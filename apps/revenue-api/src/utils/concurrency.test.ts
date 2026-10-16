import { describe, expect, it } from 'bun:test'

import { createSemaphore, mapConcurrently } from './concurrency'

describe('createSemaphore', () => {
  it('never runs more than the limit at once and lets every caller through', async () => {
    const limit = createSemaphore(2)
    let active = 0
    let peak = 0

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        limit(async () => {
          peak = Math.max(peak, ++active)
          await new Promise(resolve => setTimeout(resolve, 5))
          active--
          return i
        })
      )
    )

    expect(peak).toBe(2)
    expect(results).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('frees the slot when the call throws', async () => {
    const limit = createSemaphore(1)
    const thrown = await limit(() => Promise.reject(new Error('boom'))).catch((e: Error) => e)
    expect(thrown.message).toBe('boom')
    expect(await limit(() => Promise.resolve('next'))).toBe('next')
  })
})

describe('mapConcurrently', () => {
  it('stops taking new items once one has failed', async () => {
    let started = 0
    const run = mapConcurrently(
      Array.from({ length: 20 }, (_, i) => i),
      2,
      async i => {
        started++
        await new Promise(resolve => setTimeout(resolve, 1))
        if (i === 0) throw new Error('boom')
        return i
      }
    )

    const thrown = await run.catch((e: Error) => e)
    expect((thrown as Error).message).toBe('boom')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(started).toBeLessThan(5)
  })
})
