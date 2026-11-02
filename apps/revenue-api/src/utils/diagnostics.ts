import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'

const STUCK_AFTER_MS = 20_000
const HEARTBEAT_MS = 30_000
const HEALTH_MS = 60_000
const LAG_SAMPLE_MS = 1_000
const MAX_LOGGED = 20

const inflight = new Map<number, { label: string; startedAt: number; isRequest: boolean; headersAfterMs?: number }>()
const gauges = new Map<string, () => unknown>()
const axiosRequests = new WeakMap<InternalAxiosRequestConfig, number>()
let nextId = 0
let maxLagMs = 0
let axiosInstrumented = false

const begin = (label: string, isRequest = false): number => {
  const id = nextId++
  inflight.set(id, { label, startedAt: Date.now(), isRequest })
  return id
}

export const trackInflight = <T>(label: string, work: Promise<T>): Promise<T> => {
  const id = begin(label)
  const end = () => inflight.delete(id)
  work.then(end, end)
  return work
}

export const registerGauge = (name: string, read: () => unknown): void => {
  gauges.set(name, read)
}

export const getInflight = (): { label: string; ageMs: number; isRequest: boolean; headersAfterMs?: number }[] => {
  const now = Date.now()
  return [...inflight.values()]
    .map(({ startedAt, ...entry }) => ({ ...entry, ageMs: now - startedAt }))
    .sort((a, b) => b.ageMs - a.ageMs)
}

const readGauges = (): Record<string, unknown> => Object.fromEntries([...gauges].map(([name, read]) => [name, read()]))

export const getDiagnostics = () => {
  const { rss, heapUsed } = process.memoryUsage()
  return {
    commit: process.env['RAILWAY_GIT_COMMIT_SHA']?.slice(0, 7),
    uptimeSeconds: Math.round(process.uptime()),
    rssMb: Math.round(rss / 1e6),
    heapMb: Math.round(heapUsed / 1e6),
    maxEventLoopLagMs: maxLagMs,
    gauges: readGauges(),
    inflight: getInflight(),
  }
}

// Host and path only: query strings carry API keys
const urlLabel = (method: string, url: string | URL, baseUrl?: string): string => {
  try {
    const { host, pathname } = new URL(url, baseUrl)
    return `${method.toLowerCase()} ${host}${pathname}`
  } catch {
    return `${method.toLowerCase()} unknown`
  }
}

const requestLabel = (config: InternalAxiosRequestConfig): string =>
  urlLabel(config.method ?? 'get', config.url ?? '', config.baseURL)

const headersLabel = (headersAfterMs?: number): string =>
  headersAfterMs === undefined ? 'no headers' : `headers at ${headersAfterMs}ms`

// A stall after the headers and a server that never answers fail with the same timeout, so this tells them apart
const trackedFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const method = input instanceof Request ? input.method : (init?.method ?? 'get')
  const url = input instanceof Request ? input.url : input
  const label = urlLabel(method, url)
  const response = await fetch(input, init)

  const entry = [...inflight.values()].find(item => item.label === label && item.headersAfterMs === undefined)
  if (entry) entry.headersAfterMs = Date.now() - entry.startedAt

  return response
}

const finishAxiosRequest = (config?: InternalAxiosRequestConfig, failed = false): void => {
  const id = config && axiosRequests.get(config)
  if (id === undefined) return

  const entry = inflight.get(id)
  inflight.delete(id)
  if (failed && entry) {
    console.warn(
      `[Diagnostics] ${entry.label} failed after ${Date.now() - entry.startedAt}ms, ${headersLabel(entry.headersAfterMs)}`
    )
  }
}

export const instrumentAxios = (): void => {
  if (axiosInstrumented) return
  axiosInstrumented = true

  axios.defaults.env = { ...axios.defaults.env, fetch: trackedFetch }

  axios.interceptors.request.use(config => {
    axiosRequests.set(config, begin(requestLabel(config), true))
    return config
  })
  // Runs once the body is read, so a body that stalls after its headers stays visible here
  axios.interceptors.response.use(
    response => {
      finishAxiosRequest(response.config)
      return response
    },
    (error: unknown) => {
      if (axios.isAxiosError(error)) finishAxiosRequest(error.config, !error.response)
      throw error
    }
  )
}

export const logStuckRequests = (): void => {
  const stuck = getInflight().filter(({ ageMs }) => ageMs >= STUCK_AFTER_MS)
  if (stuck.length === 0) return

  const shown = stuck
    .slice(0, MAX_LOGGED)
    .map(
      ({ label, ageMs, headersAfterMs }) => `${label} (${Math.round(ageMs / 1000)}s, ${headersLabel(headersAfterMs)})`
    )
  console.warn(`[Diagnostics] ${stuck.length} in flight over ${STUCK_AFTER_MS / 1000}s: ${shown.join(' | ')}`)
}

const logHealth = (): void => {
  const { inflight: running, ...health } = getDiagnostics()
  console.log(`[Diagnostics] ${JSON.stringify({ ...health, inflight: running.length })}`)
  maxLagMs = 0
}

export const startDiagnostics = (): void => {
  instrumentAxios()

  let expectedAt = Date.now() + LAG_SAMPLE_MS
  setInterval(() => {
    maxLagMs = Math.max(maxLagMs, Date.now() - expectedAt)
    expectedAt = Date.now() + LAG_SAMPLE_MS
  }, LAG_SAMPLE_MS)
  setInterval(logStuckRequests, HEARTBEAT_MS)
  setInterval(logHealth, HEALTH_MS)
}
