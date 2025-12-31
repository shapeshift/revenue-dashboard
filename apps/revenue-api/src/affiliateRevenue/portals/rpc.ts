import type { RpcBlockResponse, RpcResponse } from './types'

const RPC_TIMEOUT_MS = 10000
const MAX_BINARY_SEARCH_ITERATIONS = 20

const rpcCall = async <T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)

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
      throw new Error('RPC request timeout after 10 seconds')
    }
    throw error
  }
}

const getBlockByNumber = async (rpcUrl: string, blockNumber: number | 'latest'): Promise<RpcBlockResponse> => {
  const blockParam = blockNumber === 'latest' ? 'latest' : `0x${blockNumber.toString(16)}`
  return rpcCall<RpcBlockResponse>(rpcUrl, 'eth_getBlockByNumber', [blockParam, false])
}

export const findBlockByTimestamp = async (rpcUrl: string, targetTimestamp: number): Promise<number | null> => {
  try {
    const latestBlock = await getBlockByNumber(rpcUrl, 'latest')
    const latestBlockNumber = parseInt(latestBlock.number, 16)
    const latestTimestamp = parseInt(latestBlock.timestamp, 16)

    if (targetTimestamp > latestTimestamp) {
      return null
    }

    if (targetTimestamp >= latestTimestamp - 60) {
      return latestBlockNumber
    }

    let low = 0
    let high = latestBlockNumber
    let closestBlock = latestBlockNumber
    let iterations = 0

    while (low <= high && iterations < MAX_BINARY_SEARCH_ITERATIONS) {
      iterations++
      const mid = Math.floor((low + high) / 2)

      const block = await getBlockByNumber(rpcUrl, mid)
      const blockTimestamp = parseInt(block.timestamp, 16)

      if (blockTimestamp === targetTimestamp) {
        return mid
      }

      if (blockTimestamp < targetTimestamp) {
        closestBlock = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    return closestBlock
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`RPC binary search failed: ${message}`)
    return null
  }
}
