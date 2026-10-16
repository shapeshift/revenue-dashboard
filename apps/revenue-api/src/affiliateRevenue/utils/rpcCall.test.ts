import type { AddressInfo } from 'node:net'
import net from 'node:net'

import { afterAll, afterEach, describe, expect, it } from 'bun:test'

import { createRpcCaller, isRetryableRpcError, RpcError } from './rpcCall'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

const RPC_URL = 'https://rpc-test.example/'
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const onAbort = (init: RequestInit | undefined) =>
  new Promise<never>((_, reject) =>
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  )
const mockFetch = (handler: (init?: RequestInit) => Response | Promise<Response>) => {
  globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
    Promise.resolve().then(() => handler(init))) as unknown as typeof fetch
}

const fail = async (url: string, timeoutMs?: number): Promise<RpcError> => {
  const thrown = await createRpcCaller(url, timeoutMs)('eth_blockNumber', []).catch((e: unknown) => e)
  expect(thrown).toBeInstanceOf(RpcError)
  return thrown as RpcError
}

// Real sockets, so connection failures come from Bun's own fetch rather than a mock's idea of them
const servers: net.Server[] = []
afterAll(() => servers.forEach(server => server.close()))
const tcpServer = (onData: (socket: net.Socket) => void): string => {
  const server = net.createServer(socket => socket.on('data', () => onData(socket))).listen(0)
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
}

describe('createRpcCaller', () => {
  it('keeps the node text and status of a refusal, with or without an HTTP error around it, and never retries it', async () => {
    mockFetch(() => json(400, { error: { code: -32602, message: 'Log response size exceeded.' } }))
    const wrapped = await fail(RPC_URL)
    expect([wrapped.status, wrapped.rpcMessage]).toEqual([400, 'Log response size exceeded.'])
    expect(isRetryableRpcError(wrapped)).toBe(false)

    mockFetch(() => json(200, { error: { code: -32008, message: 'Response is too big' } }))
    const bare = await fail(RPC_URL)
    expect([bare.status, bare.rpcMessage]).toEqual([undefined, 'Response is too big'])
    expect(isRetryableRpcError(bare)).toBe(false)
  })

  it.each([
    ['an outage with a non-JSON body', () => new Response('<html>bad gateway</html>', { status: 502 })],
    ['a 429', () => json(429, { error: { code: 429, message: 'exceeded compute units' } })],
    ['a rate limit inside a 200', () => json(200, { error: { code: -32005, message: 'too many requests' } })],
  ])('retries %s', async (_label, response) => {
    mockFetch(response)
    expect(isRetryableRpcError(await fail(RPC_URL))).toBe(true)
  })

  it('times out and retries whether the headers never arrive or the body stalls after them', async () => {
    mockFetch(init => onAbort(init))
    const headers = await fail(RPC_URL, 20)
    expect(headers.message).toBe('RPC request timeout after 20ms')
    expect(isRetryableRpcError(headers)).toBe(true)

    mockFetch(init => ({ ok: true, status: 200, json: () => onAbort(init) }) as unknown as Response)
    const body = await fail(RPC_URL, 20)
    expect(body.message).toBe('RPC request timeout after 20ms')
    expect(isRetryableRpcError(body)).toBe(true)
  })

  it('retries a refused connection', async () => {
    const error = await fail('http://127.0.0.1:1/')
    expect(error.message).toStartWith('RPC network error')
    expect(isRetryableRpcError(error)).toBe(true)
  })

  it('retries a connection the node drops', async () => {
    const error = await fail(tcpServer(socket => socket.destroy()))
    expect(error.message).toStartWith('RPC network error')
    expect(isRetryableRpcError(error)).toBe(true)
  })

  it('retries a 200 whose body is cut off mid-stream', async () => {
    const url = tcpServer(socket => {
      socket.write(
        'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 500\r\n\r\n{"jsonrpc":"2.0","res'
      )
      setTimeout(() => socket.destroy(), 10)
    })
    const error = await fail(url)
    expect(error.message).toBe('RPC error: unreadable response')
    expect(isRetryableRpcError(error)).toBe(true)
  })
})
