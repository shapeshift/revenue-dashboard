import { describe, expect, it } from 'bun:test'

import { createInflight, createSemaphore, mapConcurrently, withDeadline } from './concurrency'

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

describe('withDeadline', () => {
  it('rejects a promise that never settles', async () => {
    const error = await withDeadline(new Promise(() => {}), 10, 'stuck').catch((e: unknown) => e)
    expect(error).toEqual(new Error('stuck exceeded 10ms'))
  })

  it('passes through a result inside the deadline', async () => {
    expect(await withDeadline(Promise.resolve(1), 1000, 'quick')).toBe(1)
  })
})

describe('createInflight', () => {
  it('shares a key while it is in flight and runs it again once settled', async () => {
    const inflight = createInflight<number>()
    let runs = 0
    const work = () => Promise.resolve(++runs)

    const [a, b, other] = await Promise.all([inflight('a', work), inflight('a', work), inflight('b', work)])
    const again = await inflight('a', work)

    expect([a, b, other, again]).toEqual([1, 1, 2, 3])
  })
})
