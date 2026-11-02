import axios from 'axios'
import { afterAll, describe, expect, test } from 'bun:test'

import './http'
import { isRetryableError } from './retry'

const server = Bun.serve({
  port: 0,
  idleTimeout: 0,
  fetch: () =>
    new Response(
      new ReadableStream({ start: controller => controller.enqueue(new TextEncoder().encode('{"prices":[')) }),
      {
        headers: { 'content-type': 'application/json' },
      }
    ),
})

afterAll(() => void server.stop(true))

describe('axios defaults', () => {
  test('times out a response that stalls after its headers, retryably', async () => {
    const error = await axios.get(`http://localhost:${server.port}`, { timeout: 100 }).catch((e: unknown) => e)
    expect(axios.isAxiosError(error)).toBe(true)
    expect(isRetryableError(error)).toBe(true)
  })

  test('keeps treating a dropped connection as retryable', async () => {
    const error = await axios.get('http://localhost:1').catch((e: unknown) => e)
    expect(isRetryableError(error)).toBe(true)
  })
})
