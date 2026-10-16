import { formatError } from '../../utils/error'
import { isRetryableError } from '../../utils/retry'

interface RpcResponse<T> {
  result: T
  error?: { code: number; message: string }
}

// Carries the HTTP status and the node's own error text so callers classify on those, not on prose; transient marks
// a failure to get any answer (timeout, dropped connection, cut-off body), which a retry may clear
export class RpcError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly rpcMessage?: string,
    readonly transient = false
  ) {
    super(message)
    this.name = 'RpcError'
  }
}

// Some nodes rate-limit with a 429, others with a JSON-RPC error inside a 200
export const isRateLimited = (error: unknown): boolean =>
  error instanceof RpcError && (error.status === 429 || /rate limit|too many requests/i.test(error.rpcMessage ?? ''))

export const isRetryableRpcError = (error: unknown): boolean =>
  isRetryableError(error) ||
  isRateLimited(error) ||
  (error instanceof RpcError && (error.transient || (error.status ?? 0) >= 500))

export const createRpcCaller = (rpcUrl: string, timeoutMs = 30000) => {
  return async <T>(method: string, params: unknown[]): Promise<T> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      })

      // Parsed before the status check: some nodes wrap a refusal's JSON-RPC error in an HTTP error status
      const data = (await response.json().catch(() => undefined)) as RpcResponse<T> | undefined

      if (!response.ok) {
        const detail = data?.error?.message ? `: ${data.error.message}` : ''
        throw new RpcError(
          `RPC HTTP error: ${response.status} ${response.statusText}${detail}`,
          response.status,
          data?.error?.message
        )
      }

      if (data?.error) throw new RpcError(`RPC error: ${data.error.message}`, undefined, data.error.message)
      if (!data || !('result' in data)) throw new RpcError('RPC error: unreadable response', undefined, undefined, true)

      return data.result
    } catch (error) {
      if (controller.signal.aborted) {
        throw new RpcError(`RPC request timeout after ${timeoutMs}ms`, undefined, undefined, true)
      }
      if (error instanceof RpcError) throw error
      throw new RpcError(`RPC network error: ${formatError(error)}`, undefined, undefined, true)
    } finally {
      // Cleared only once the body is read, so a node that sends headers and then stalls still times out
      clearTimeout(timeoutId)
    }
  }
}
