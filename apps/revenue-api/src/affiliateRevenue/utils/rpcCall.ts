import { isRetryableError } from '../../utils/retry'

interface RpcResponse<T> {
  result: T
  error?: { code: number; message: string }
}

// Carries the HTTP status and the node's own error text so callers classify on those, not on prose
export class RpcError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly rpcMessage?: string
  ) {
    super(message)
    this.name = 'RpcError'
  }
}

// Nodes answer rate limits and outages as HTTP errors, which the default predicate doesn't retry
export const isRetryableRpcError = (error: unknown): boolean =>
  isRetryableError(error) ||
  (error instanceof RpcError && error.status !== undefined && (error.status === 429 || error.status >= 500))

export const createRpcCaller = (rpcUrl: string, timeoutMs = 30000) => {
  return async <T>(method: string, params: unknown[]): Promise<T> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Some nodes answer a refused request with an HTTP error status around the JSON-RPC error
      const data: RpcResponse<T> | undefined = await response.json().catch(() => undefined)

      if (!response.ok) {
        const detail = data?.error?.message ? `: ${data.error.message}` : ''
        throw new RpcError(
          `RPC HTTP error: ${response.status} ${response.statusText}${detail}`,
          response.status,
          data?.error?.message
        )
      }

      if (!data) {
        throw new RpcError('RPC error: empty response')
      }

      if (data.error) {
        throw new RpcError(`RPC error: ${data.error.message}`, undefined, data.error.message)
      }

      return data.result
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RpcError(`RPC request timeout after ${timeoutMs}ms`)
      }
      throw error
    }
  }
}
