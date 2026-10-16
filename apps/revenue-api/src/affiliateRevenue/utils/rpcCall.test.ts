import { afterEach, describe, expect, it } from 'bun:test'

import { createRpcCaller, isRateLimited, isRetryableRpcError, RpcError } from './rpcCall'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

const RPC_URL = 'https://rpc-test.example/'
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const abortError = () => new DOMException('The operation was aborted.', 'AbortError')
const onAbort = (init: RequestInit | undefined) =>
  new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(abortError())))

const mockFetch = (handler: (init?: RequestInit) => Response | Promise<Response>) => {
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    Promise.resolve().then(() => handler(init))) as unknown as typeof fetch
}

const fail = async (fn: () => Promise<unknown>): Promise<RpcError> => {
  const thrown = await fn().catch((e: unknown) => e)
  expect(thrown).toBeInstanceOf(RpcError)
  return thrown as RpcError
}

describe('createRpcCaller', () => {
  it('returns the JSON-RPC result', async () => {
    mockFetch(() => json(200, { jsonrpc: '2.0', id: 1, result: '0x10' }))
    expect(await createRpcCaller(RPC_URL)<string>('eth_blockNumber', [])).toBe('0x10')
  })

  it('surfaces a JSON-RPC error inside a 200 with the node text and no status', async () => {
    mockFetch(() => json(200, { error: { code: -32602, message: 'invalid params' } }))
    const error = await fail(() => createRpcCaller(RPC_URL)('eth_getLogs', []))
    expect(error.status).toBeUndefined()
    expect(error.rpcMessage).toBe('invalid params')
    expect(isRetryableRpcError(error)).toBe(false)
  })

  it('keeps the HTTP status and node text when a refusal comes with a 400', async () => {
    mockFetch(() => json(400, { error: { code: -32602, message: 'Log response size exceeded.' } }))
    const error = await fail(() => createRpcCaller(RPC_URL)('eth_getLogs', []))
    expect(error.status).toBe(400)
    expect(error.rpcMessage).toBe('Log response size exceeded.')
    expect(isRetryableRpcError(error)).toBe(false)
  })

  it('treats an outage with a non-JSON body as a retryable HTTP error', async () => {
    mockFetch(() => new Response('<html>bad gateway</html>', { status: 502 }))
    const error = await fail(() => createRpcCaller(RPC_URL)('eth_blockNumber', []))
    expect(error.status).toBe(502)
    expect(error.rpcMessage).toBeUndefined()
    expect(isRetryableRpcError(error)).toBe(true)
  })

  it('retries a 429 and a rate limit delivered inside a 200 alike', async () => {
    mockFetch(() => json(429, { error: { code: 429, message: 'Too Many Requests' } }))
    const http = await fail(() => createRpcCaller(RPC_URL)('eth_blockNumber', []))
    expect(isRateLimited(http)).toBe(true)
    expect(isRetryableRpcError(http)).toBe(true)

    mockFetch(() => json(200, { error: { code: -32005, message: 'too many requests, slow down' } }))
    const inBody = await fail(() => createRpcCaller(RPC_URL)('eth_blockNumber', []))
    expect(inBody.status).toBeUndefined()
    expect(isRateLimited(inBody)).toBe(true)
    expect(isRetryableRpcError(inBody)).toBe(true)
  })

  it('times out when the headers never arrive, and the timeout is retryable', async () => {
    mockFetch(init => onAbort(init))
    const error = await fail(() => createRpcCaller(RPC_URL, 20)('eth_blockNumber', []))
    expect(error.message).toBe('RPC request timeout after 20ms')
    expect(isRetryableRpcError(error)).toBe(true)
  })

  it('times out when the body stalls after the headers, instead of hanging or reporting an empty response', async () => {
    mockFetch(init => ({ ok: true, status: 200, statusText: 'OK', json: () => onAbort(init) }) as unknown as Response)
    const error = await fail(() => createRpcCaller(RPC_URL, 20)('eth_getLogs', []))
    expect(error.message).toBe('RPC request timeout after 20ms')
    expect(isRetryableRpcError(error)).toBe(true)
  })

  it('reports an unparseable 200 body as an empty response', async () => {
    mockFetch(() => new Response('not json', { status: 200 }))
    const error = await fail(() => createRpcCaller(RPC_URL)('eth_blockNumber', []))
    expect(error.message).toBe('RPC error: empty response')
  })
})
