import { afterEach, describe, expect, it } from 'bun:test'

import { createEvmLogClient, getSuggestedEnd, isRangeRefusal } from './evmLogClient'
import { RpcError } from './rpcCall'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

type Request = { method: string; params: { fromBlock?: string; toBlock?: string }[] }
type Window = [number, number]

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ok = (result: unknown) => json(200, { jsonrpc: '2.0', id: 1, result })
const refuse = (status: number, message: string) => json(status, { error: { code: -32602, message } })
const hex = (n: number) => `0x${n.toString(16)}`

const ALCHEMY_SIZE = (from: number, to: number) =>
  `Log response size exceeded. You can make eth_getLogs requests with up to a 10,000 block range and no limit on the response size, or you can request any block range with a cap of 10K logs in the response. Based on your parameters and the response size limit, this block range should work: [${hex(from)}, ${hex(to)}]`

// A node that accepts any window up to `maxWidth` blocks and answers one log per block, refusing wider ones via `refusal`
const mockNode = (maxWidth: number, refusal: (from: number, to: number) => Response) => {
  const requests: Window[] = []
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    const { method, params } = JSON.parse(init?.body as string) as Request
    if (method !== 'eth_getLogs') {
      return Promise.resolve(ok({ number: '0x64', timestamp: hex(Math.floor(Date.now() / 1000)) }))
    }

    const from = Number(BigInt(params[0].fromBlock!))
    const to = Number(BigInt(params[0].toBlock!))
    requests.push([from, to])
    if (to - from + 1 > maxWidth) return Promise.resolve(refusal(from, to))

    return Promise.resolve(ok(Array.from({ length: to - from + 1 }, (_, i) => ({ blockNumber: hex(from + i) }))))
  }) as unknown as typeof fetch
  return { requests }
}

let n = 0
const client = (blockRangeCap?: number) =>
  createEvmLogClient(`eip155:${900 + n}`, `https://node-${++n}.example/`, 'test', blockRangeCap)
const blocks = (logs: { blockNumber: string }[]) => logs.map(log => Number(BigInt(log.blockNumber)))
const sequence = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('getLogs', () => {
  it('asks for the whole range once when the node accepts it', async () => {
    const node = mockNode(10_000, () => refuse(400, 'unused'))
    const logs = await client().getLogs(undefined, [], 100, 2_599)
    expect(node.requests).toEqual([[100, 2_599]])
    expect(blocks(logs)).toEqual(sequence(100, 2_599))
  })

  it('takes Alchemy at its word on the range that fits, then asks for the rest again', async () => {
    const node = mockNode(1_000, (from, to) => refuse(400, ALCHEMY_SIZE(from, Math.min(to, from + 999))))
    const logs = await client().getLogs('0xrouter', [], 0, 2_499)
    expect(node.requests).toEqual([
      [0, 2_499],
      [0, 999],
      [1_000, 2_499],
      [1_000, 1_999],
      [2_000, 2_499],
    ])
    expect(blocks(logs)).toEqual(sequence(0, 2_499))
  })

  it('halves the window when a refusal names nothing, and still covers every block in order', async () => {
    const node = mockNode(1_000, () => refuse(200, 'Response is too big'))
    const logs = await client().getLogs(undefined, [], 0, 3_999)
    expect(node.requests.slice(0, 3)).toEqual([
      [0, 3_999],
      [0, 1_999],
      [0, 999],
    ])
    expect(blocks(logs)).toEqual(sequence(0, 3_999))
  })

  it('grows from the last accepted width rather than halving down from the whole remainder every window', async () => {
    const node = mockNode(1_000, () => refuse(200, 'Response is too big'))
    const logs = await client().getLogs(undefined, [], 0, 7_999)
    const firstAccepted = node.requests.findIndex(([from, to]) => to - from + 1 <= 1_000)
    expect(node.requests.slice(firstAccepted + 1).every(([from, to]) => to - from + 1 <= 2_000)).toBe(true)
    expect(blocks(logs)).toEqual(sequence(0, 7_999))
  })

  it('fans cap-wide windows out on a capped network, with no refusal and results in order', async () => {
    const node = mockNode(2_000, () => refuse(400, 'You can make eth_getLogs requests with up to a 2000 block range.'))
    const logs = await client(2_000).getLogs(undefined, [], 0, 6_999)
    expect(node.requests).toHaveLength(4)
    expect(node.requests.every(([from, to]) => to - from + 1 <= 2_000)).toBe(true)
    expect(blocks(logs)).toEqual(sequence(0, 6_999))
  })

  it('propagates an error that is not about the range without narrowing', async () => {
    const node = mockNode(0, () => refuse(400, 'invalid argument 0: json: cannot unmarshal'))
    const thrown = await client()
      .getLogs(undefined, [], 0, 999)
      .catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(RpcError)
    expect(node.requests).toHaveLength(1)
  })

  it('gives up once the window is already at the floor', async () => {
    const node = mockNode(0, () => refuse(200, 'Response is too big'))
    const thrown = await client()
      .getLogs(undefined, [], 0, 799)
      .catch((e: unknown) => e)
    expect((thrown as RpcError).rpcMessage).toBe('Response is too big')
    expect(node.requests[node.requests.length - 1]).toEqual([0, 99])
  })

  it('retries a rate limit as-is rather than narrowing', async () => {
    let calls = 0
    globalThis.fetch = (() =>
      Promise.resolve(
        ++calls === 1 ? refuse(200, 'too many requests') : ok([{ blockNumber: '0x1' }])
      )) as unknown as typeof fetch
    const logs = await client().getLogs(undefined, [], 0, 9_999)
    expect(calls).toBe(2)
    expect(logs).toHaveLength(1)
  })

  it('makes no request for an empty range', async () => {
    const node = mockNode(10_000, () => refuse(400, 'unused'))
    expect(await client().getLogs(undefined, [], 10, 9)).toEqual([])
    expect(node.requests).toEqual([])
  })
})

describe('resolveBlock', () => {
  it('resolves a future timestamp to the head without any lookup', async () => {
    const node = mockNode(10_000, () => refuse(400, 'unused'))
    expect(await client().resolveBlock(Math.floor(Date.now() / 1000) + 3_600)).toBe(100)
    expect(node.requests).toEqual([])
  })
})

describe('refusal classification', () => {
  const rpc = (message: string, status?: number) => new RpcError(message, status, message)

  it('separates range refusals from rate limits and outages', () => {
    expect(isRangeRefusal(rpc('Log response size exceeded', 400))).toBe(true)
    expect(isRangeRefusal(rpc('Response is too big'))).toBe(true)
    expect(isRangeRefusal(rpc('query timeout exceeded'))).toBe(true)
    expect(isRangeRefusal(rpc('too many requests'))).toBe(false)
    expect(isRangeRefusal(rpc('Too Many Requests', 429))).toBe(false)
    expect(isRangeRefusal(rpc('block range too large', 503))).toBe(false)
    expect(isRangeRefusal(new Error('block range'))).toBe(false)
    expect(isRangeRefusal(rpc('query returned more than 10000 results'))).toBe(true)
    expect(isRangeRefusal(rpc('Response too large'))).toBe(true)
    // Our own deadline carries no node text, so it is retried as-is rather than narrowed
    expect(isRangeRefusal(new RpcError('RPC request timeout after 30000ms'))).toBe(false)
  })

  it('reads the suggested end out of a size refusal', () => {
    expect(getSuggestedEnd(rpc(ALCHEMY_SIZE(0, 0x18ccd8a)))).toBe(0x18ccd8a)
    expect(getSuggestedEnd(rpc('Response is too big'))).toBeUndefined()
  })
})
