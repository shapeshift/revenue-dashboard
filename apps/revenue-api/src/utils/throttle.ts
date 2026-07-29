const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Spread callers at least `intervalMs` apart, for APIs that rate-limit by wall clock.
 *
 * Each caller claims its slot synchronously — before any await — so concurrent callers
 * can't read the same slot and resume together. That matters because a provider's fees
 * are fetched from more than one place at once: a tracker may fetch its cached and recent
 * ranges concurrently, and each revenue route runs its own provider sweep, so two
 * overlapping requests share the same throttle.
 */
export const createThrottle = (intervalMs: number) => {
  let nextSlot = 0

  return async (): Promise<void> => {
    const now = Date.now()
    const runAt = Math.max(now, nextSlot)
    nextSlot = runAt + intervalMs

    const wait = runAt - now
    if (wait > 0) await sleep(wait)
  }
}
