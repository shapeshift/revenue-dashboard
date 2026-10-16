import { describe, expect, it } from 'bun:test'

import { createSemaphore } from './concurrency'

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
