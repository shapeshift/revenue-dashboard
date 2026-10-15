import { createRpcCaller } from './rpcCall'

const RPC_TIMEOUT_MS = 10000
const MAX_BINARY_SEARCH_ITERATIONS = 20

type Block = { number: string; timestamp: string }

// Binary search over block headers for chains without an indexer: the last block at or before the timestamp
export const findBlockByTimestamp = async (rpcUrl: string, targetTimestamp: number): Promise<number | null> => {
  const rpcCall = createRpcCaller(rpcUrl, RPC_TIMEOUT_MS)
  const getBlock = (block: number | 'latest') =>
    rpcCall<Block>('eth_getBlockByNumber', [block === 'latest' ? 'latest' : `0x${block.toString(16)}`, false])

  try {
    const latestBlock = await getBlock('latest')
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

      const block = await getBlock(mid)
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
