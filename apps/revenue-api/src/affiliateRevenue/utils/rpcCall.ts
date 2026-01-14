interface RpcResponse<T> {
  result: T
  error?: { code: number; message: string }
}

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

      if (!response.ok) {
        throw new Error(`RPC HTTP error: ${response.status} ${response.statusText}`)
      }

      const data: RpcResponse<T> = await response.json()

      if (data.error) {
        throw new Error(`RPC error: ${data.error.message}`)
      }

      return data.result
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`RPC request timeout after ${timeoutMs}ms`)
      }
      throw error
    }
  }
}
