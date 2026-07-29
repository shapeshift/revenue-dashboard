import { describe, expect, test } from 'bun:test'

import { createThrottle } from './utils'

const INTERVAL = 50

// Timers fire late under load, never early — assert the floor, with a small tolerance for
// setTimeout's own rounding so this doesn't flake on a busy machine.
const TOLERANCE = 5

describe('createThrottle', () => {
  test('lets the first caller through immediately', async () => {
    const throttle = createThrottle(INTERVAL)

    const start = Date.now()
    await throttle()

    expect(Date.now() - start).toBeLessThan(INTERVAL)
  })

  test('spaces concurrent callers — they claim distinct slots, not the same one', async () => {
    const throttle = createThrottle(INTERVAL)
    const start = Date.now()

    // The bug this guards: callers that read the shared slot before any of them
    // writes it all wait out the same delay and then fire together.
    const at = await Promise.all(
      Array.from({ length: 4 }, async () => {
        await throttle()
        return Date.now() - start
      })
    )

    for (let i = 1; i < at.length; i++) {
      expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(INTERVAL - TOLERANCE)
    }
  })

  test('spaces sequential callers', async () => {
    const throttle = createThrottle(INTERVAL)

    await throttle()
    const start = Date.now()
    await throttle()

    expect(Date.now() - start).toBeGreaterThanOrEqual(INTERVAL - TOLERANCE)
  })

  test('does not delay a caller that arrives after the interval has already elapsed', async () => {
    const throttle = createThrottle(INTERVAL)

    await throttle()
    await new Promise(resolve => setTimeout(resolve, INTERVAL + 10))

    const start = Date.now()
    await throttle()

    expect(Date.now() - start).toBeLessThan(INTERVAL)
  })
})
