import axios from 'axios'
import { afterAll, describe, expect, spyOn, test } from 'bun:test'

import {
  getDiagnostics,
  getInflight,
  instrumentAxios,
  logStuckRequests,
  registerGauge,
  trackInflight,
} from './diagnostics'

let seen: string[] = []
const stalled = Bun.serve({
  port: 0,
  idleTimeout: 0,
  fetch: () => new Response(new ReadableStream({ start: controller => controller.enqueue(new Uint8Array([123])) })),
})
const silent = Bun.serve({ port: 0, idleTimeout: 0, fetch: () => new Promise<Response>(() => {}) })
const server = Bun.serve({
  port: 0,
  fetch: () => {
    seen = getInflight().map(({ label }) => label)
    return Response.json({ ok: true })
  },
})

afterAll(() => {
  void server.stop(true)
  void stalled.stop(true)
  void silent.stop(true)
})

describe('diagnostics', () => {
  test('tracks work until it settles, either way', async () => {
    let finish = () => {}
    const work = trackInflight('slow work', new Promise<void>(resolve => (finish = resolve)))
    expect(getInflight().map(({ label }) => label)).toContain('slow work')

    finish()
    await work
    expect(getInflight().map(({ label }) => label)).not.toContain('slow work')

    await trackInflight('failing work', Promise.reject(new Error('no'))).catch(() => {})
    expect(getInflight().map(({ label }) => label)).not.toContain('failing work')
  })

  test('never exposes a query string', async () => {
    instrumentAxios()

    await axios.get(`http://localhost:${server.port}/path`, { params: { apiKey: 'secret' } })

    expect(seen.join()).toContain('/path')
    expect(seen.join()).not.toContain('secret')
    expect(getInflight().filter(({ label }) => label.includes('/path'))).toEqual([])
  })

  test('tells a stalled body from a server that never answered', async () => {
    instrumentAxios()
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

    await axios.get(`http://localhost:${stalled.port}/body`, { timeout: 100 }).catch(() => {})
    await axios.get(`http://localhost:${silent.port}/headers`, { timeout: 100 }).catch(() => {})

    const logged = warn.mock.calls.map(([message]) => String(message))
    warn.mockRestore()

    expect(logged.find(message => message.includes('/body'))).toMatch(/headers at \d+ms/)
    expect(logged.find(message => message.includes('/headers'))).toContain('no headers')
  })

  test('stays quiet until something has been running a while', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    logStuckRequests()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  test('reports registered gauges', () => {
    registerGauge('test', () => ({ size: 3 }))
    expect(getDiagnostics().gauges['test']).toEqual({ size: 3 })
  })
})
