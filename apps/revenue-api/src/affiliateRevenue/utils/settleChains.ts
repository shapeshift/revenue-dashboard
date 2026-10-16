import { formatError } from '../../utils/error'

// Every chain's result, or a provider failure naming the chains that failed (each logged for debugging)
export const settleChains = <T>(service: string, chains: string[], results: PromiseSettledResult<T>[]): T[] => {
  const values: T[] = []
  const failed: string[] = []

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      values.push(result.value)
    } else {
      failed.push(chains[i])
      console.error(`[${service}] ${chains[i]} failed: ${formatError(result.reason)}`)
    }
  })

  // One missing chain fails the provider, so reconciliation won't deduct partner fees against missing gross
  if (failed.length > 0) throw new Error(`[${service}] ${failed.join(', ')} failed`)

  return values
}
