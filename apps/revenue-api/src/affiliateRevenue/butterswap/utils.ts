import { BLOCK_TIME_SECONDS, MAP_RPC_URL } from './constants'
import type { RpcResponse } from './types'

export const rpcCall = async <T>(method: string, params: unknown[]): Promise<T> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(MAP_RPC_URL, {
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
      throw new Error('RPC request timeout after 10 seconds')
    }
    throw error
  }
}

export const estimateBlockFromTimestamp = (
  currentBlock: number,
  currentTimestamp: number,
  targetTimestamp: number
): number => {
  const blocksAgo = Math.floor((currentTimestamp - targetTimestamp) / BLOCK_TIME_SECONDS)
  const estimatedBlock = currentBlock - blocksAgo
  return Math.max(0, Math.min(estimatedBlock, currentBlock))
}
