import { describe, expect, it, spyOn } from 'bun:test'

import { settleChains } from './settleChains'

const settle = <T>(promises: Promise<T>[]) => Promise.allSettled(promises)

describe('settleChains', () => {
  it('returns every chain result in order when all succeed', async () => {
    const results = await settle([Promise.resolve([1]), Promise.resolve([2, 3])])
    expect(settleChains('svc', ['a', 'b'], results)).toEqual([[1], [2, 3]])
  })

  it('throws naming the failed chains after logging each one', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const results = await settle([
      Promise.resolve([1]),
      Promise.reject(new Error('rpc down')),
      Promise.reject(new Error('timeout')),
    ])

    expect(() => settleChains('svc', ['a', 'b', 'c'], results)).toThrow('[svc] b, c failed')
    expect(error).toHaveBeenCalledTimes(2)
    expect(error.mock.calls[0][0]).toBe('[svc] b failed: rpc down')
    error.mockRestore()
  })
})
