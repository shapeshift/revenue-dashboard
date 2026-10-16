import { describe, expect, it, spyOn } from 'bun:test'

import { settleChains } from './settleChains'

const name = (chain: string) => chain

describe('settleChains', () => {
  it('returns every chain result in order when all succeed', async () => {
    const result = await settleChains('svc', ['a', 'b'], name, chain => Promise.resolve(chain.toUpperCase()))
    expect(result).toEqual(['A', 'B'])
  })

  it('throws naming the failed chains after logging each one', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const run = (chain: string) => (chain === 'a' ? Promise.resolve(1) : Promise.reject(new Error(`${chain} down`)))

    const thrown = await settleChains('svc', ['a', 'b', 'c'], name, run).catch((e: Error) => e)
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('[svc] b, c failed')
    expect(error).toHaveBeenCalledTimes(2)
    expect(error.mock.calls[0][0]).toBe('[svc] b failed: b down')
    error.mockRestore()
  })
})
