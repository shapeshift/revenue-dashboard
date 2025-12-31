import axios from 'axios'

import { getCachedBlockNumber, saveCachedBlockNumber } from '../cache'

import { findBlockByTimestamp } from './rpc'
import type { BlockNumberResponse, ChainConfig } from './types'

const RECENT_THRESHOLD = 3600 // 1 hour in seconds

export const convertTimestampToBlock = async (config: ChainConfig, timestamp: number): Promise<number | null> => {
  // Check cache first
  const cached = getCachedBlockNumber(config.chainId, timestamp)
  if (cached !== undefined) return cached

  // If RPC is available but no explorer URL, skip straight to RPC (for chains with deprecated APIs)
  if ((!config.explorerUrl || config.explorerUrl === '') && config.rpcUrl) {
    const blockNumber = await findBlockByTimestamp(config.rpcUrl, timestamp)
    if (blockNumber !== null) {
      saveCachedBlockNumber(config.chainId, timestamp, blockNumber)
    }
    return blockNumber
  }

  try {
    const { data } = await axios.get<BlockNumberResponse>(`${config.explorerUrl}/api`, {
      params: {
        module: 'block',
        action: 'getblocknobytime',
        timestamp,
        closest: 'before',
      },
      timeout: 10000,
    })

    if (data.status !== '1' || !data.result) {
      if (config.rpcUrl) {
        const blockNumber = await findBlockByTimestamp(config.rpcUrl, timestamp)
        if (blockNumber !== null) {
          saveCachedBlockNumber(config.chainId, timestamp, blockNumber)
          return blockNumber
        }
      }

      console.warn(
        `[portals:${config.network}] Failed to get block number for timestamp ${timestamp}: ${data.message || 'Unknown error'}`
      )
      return null
    }

    // Handle both direct number and nested result.blockNumber formats
    const blockNumber =
      typeof data.result === 'string' ? parseInt(data.result, 10) : parseInt(data.result.blockNumber, 10)

    if (isNaN(blockNumber)) {
      console.warn(
        `[portals:${config.network}] Invalid block number returned:`,
        typeof data.result === 'string' ? data.result : data.result.blockNumber
      )
      return null
    }

    saveCachedBlockNumber(config.chainId, timestamp, blockNumber)
    return blockNumber
  } catch (error) {
    if (config.rpcUrl) {
      try {
        const blockNumber = await findBlockByTimestamp(config.rpcUrl, timestamp)
        if (blockNumber !== null) {
          saveCachedBlockNumber(config.chainId, timestamp, blockNumber)
          return blockNumber
        }
      } catch {
        // RPC also failed, fall through to final error
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[portals:${config.network}] Error converting timestamp to block:`, message)
    return null
  }
}

export const getBlockNumbersForRange = async (
  config: ChainConfig,
  startTimestamp: number,
  endTimestamp: number
): Promise<{ fromBlock: number | string; toBlock: number | string } | null> => {
  const now = Math.floor(Date.now() / 1000)

  // If end is recent (within 1 hour), use 'latest' instead of specific block
  // This avoids issues with blocks still being mined
  const useLatestForEnd = endTimestamp >= now - RECENT_THRESHOLD

  // Convert start timestamp
  const fromBlock = await convertTimestampToBlock(config, startTimestamp)
  if (fromBlock === null) return null

  // Convert end timestamp if not recent, otherwise use 'latest'
  if (useLatestForEnd) {
    return { fromBlock, toBlock: 'latest' }
  }

  const toBlock = await convertTimestampToBlock(config, endTimestamp)
  if (toBlock === null) return null

  return { fromBlock, toBlock }
}
