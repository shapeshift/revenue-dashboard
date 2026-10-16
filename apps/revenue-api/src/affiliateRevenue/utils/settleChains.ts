import { formatError } from '../../utils/error'

// Runs every chain and returns their results in order, or fails the provider naming the chains that failed
export const settleChains = async <C, T>(
  service: string,
  chains: C[],
  name: (chain: C) => string,
  run: (chain: C) => Promise<T>
): Promise<T[]> => {
  const results = await Promise.allSettled(chains.map(run))
  const values: T[] = []
  const failed: string[] = []

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      values.push(result.value)
    } else {
      failed.push(name(chains[i]))
      console.error(`[${service}] ${name(chains[i])} failed: ${formatError(result.reason)}`)
    }
  })

  // One missing chain fails the provider, so reconciliation won't deduct partner fees against missing gross
  if (failed.length > 0) throw new Error(`[${service}] ${failed.join(', ')} failed`)

  return values
}
