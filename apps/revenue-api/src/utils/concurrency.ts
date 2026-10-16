// Maps items with at most `limit` in flight; results keep the items' order and one failure rejects the run
export const mapConcurrently = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length)
  let next = 0

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    })
  )

  return results
}

// At most `limit` calls in flight; later callers wait their turn in arrival order
export const createSemaphore = (limit: number) => {
  let active = 0
  const waiting: (() => void)[] = []

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < limit) active++
    else await new Promise<void>(resolve => waiting.push(resolve))

    try {
      return await fn()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}
