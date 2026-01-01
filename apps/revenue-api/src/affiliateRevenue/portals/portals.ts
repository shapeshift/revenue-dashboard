import axios from 'axios'
import { padHex, zeroAddress } from 'viem'

import type { Fees } from '..'
import {
  getCacheableThreshold,
  getCachedTokenTransfer,
  getDateEndTimestamp,
  getDateStartTimestamp,
  groupFeesByDate,
  saveCachedFees,
  saveCachedTokenTransfer,
  splitDateRange,
  tryGetCachedFees,
} from '../cache'
import { assetDataService } from '../../utils/assetDataService'

import { getBlockNumbersForRange } from './blockNumbers'
import { CHAIN_CONFIGS, PORTAL_EVENT_SIGNATURE } from './constants'
import type {
  BlockscoutTokenTransferResponse,
  ChainConfig,
  EtherscanLogsResponse,
  EtherscanTokenTxResponse,
  PortalEventData,
  TokenTransfer,
} from './types'
import { buildAssetId, calculateFallbackFee, decodePortalEventData, getTokenPrice } from './utils'

const getPortalEventsFromExplorer = async (
  config: ChainConfig,
  startTimestamp: number,
  endTimestamp: number
): Promise<PortalEventData[]> => {
  const events: PortalEventData[] = []
  const treasuryTopic = padHex(config.treasury.toLowerCase() as `0x${string}`, { size: 32 })

  // Convert timestamps to block numbers for efficient API filtering
  const blockRange = await getBlockNumbersForRange(config, startTimestamp, endTimestamp)

  if (!blockRange) {
    return events
  }

  const fromBlock = blockRange.fromBlock
  const toBlock = blockRange.toBlock

  const url = `${config.explorerUrl}/api`
  const { data } = await axios.get<EtherscanLogsResponse>(url, {
    params: {
      module: 'logs',
      action: 'getLogs',
      address: config.router,
      topic0: PORTAL_EVENT_SIGNATURE,
      topic0_3_opr: 'and',
      topic3: treasuryTopic,
      fromBlock,
      toBlock,
      sort: 'desc',
    },
  })

  if (data.status !== '1' || !Array.isArray(data.result)) {
    return events
  }

  for (const log of data.result) {
    const logTimestamp = parseInt(log.timeStamp, 16)

    // Timestamp validation as safety check (block range should handle this, but extra safety)
    if (logTimestamp < startTimestamp || logTimestamp > endTimestamp) continue

    const decoded = decodePortalEventData(log.data)
    if (!decoded) continue

    events.push({
      txHash: log.transactionHash,
      timestamp: logTimestamp,
      inputToken: decoded.inputToken,
      inputAmount: decoded.inputAmount,
      outputToken: decoded.outputToken,
      outputAmount: decoded.outputAmount,
    })
  }

  return events
}

const getFeeTransferFromExplorer = async (config: ChainConfig, txHash: string): Promise<TokenTransfer | null> => {
  const treasuryLower = config.treasury.toLowerCase()

  if (config.apiType === 'blockscout') {
    const url = `${config.explorerUrl}/api/v2/transactions/${txHash}/token-transfers`
    try {
      const { data } = await axios.get<BlockscoutTokenTransferResponse>(url)

      for (const transfer of data.items || []) {
        if (transfer.to?.hash?.toLowerCase() === treasuryLower && transfer.token_type === 'ERC-20') {
          return {
            token: transfer.token.address_hash,
            amount: transfer.total.value,
            decimals: parseInt(transfer.total.decimals),
            symbol: transfer.token.symbol || '',
          }
        }
      }
    } catch (error) {
      return null
    }
  } else {
    const url = `${config.explorerUrl}/api`
    const { data } = await axios.get<EtherscanTokenTxResponse>(url, {
      params: {
        module: 'account',
        action: 'tokentx',
        txhash: txHash,
      },
    })

    if (data.status !== '1' || !Array.isArray(data.result)) {
      return null
    }

    for (const transfer of data.result) {
      if (transfer.to.toLowerCase() === treasuryLower) {
        return {
          token: transfer.contractAddress,
          amount: transfer.value,
          decimals: parseInt(transfer.tokenDecimal),
          symbol: transfer.tokenSymbol,
        }
      }
    }
  }

  return null
}

const constructFeeFromEvent = async (config: ChainConfig, event: PortalEventData): Promise<Fees | null> => {
  try {
    const cacheKey = `${config.chainId}:${event.txHash}`
    const cached = getCachedTokenTransfer(cacheKey)

    const feeTransfer =
      cached !== undefined
        ? cached
        : await (async () => {
            try {
              const transfer = await getFeeTransferFromExplorer(config, event.txHash)
              saveCachedTokenTransfer(cacheKey, transfer)
              return transfer
            } catch (error) {
              saveCachedTokenTransfer(cacheKey, null)
              return null
            }
          })()

    if (feeTransfer) {
      const assetId = buildAssetId(config.chainId, feeTransfer.token ?? zeroAddress)
      const amountDecimal = Number(feeTransfer.amount) / 10 ** feeTransfer.decimals
      const price = await getTokenPrice(config.chainId, feeTransfer.token ?? '')
      const amountUsd = price ? (amountDecimal * price).toString() : undefined

      return {
        chainId: config.chainId,
        assetId,
        service: 'portals',
        txHash: event.txHash,
        timestamp: event.timestamp,
        amount: feeTransfer.amount,
        amountUsd,
      }
    } else {
      const inputToken = event.inputToken ?? zeroAddress
      const assetId = buildAssetId(config.chainId, inputToken)
      const decimals = assetDataService.getAssetDecimals(assetId)
      const feeWei = calculateFallbackFee(event.inputAmount)
      const feeDecimal = Number(feeWei) / 10 ** decimals
      const price = await getTokenPrice(config.chainId, inputToken)
      const amountUsd = price ? (feeDecimal * price).toString() : undefined

      return {
        chainId: config.chainId,
        assetId,
        service: 'portals',
        txHash: event.txHash,
        timestamp: event.timestamp,
        amount: feeWei,
        amountUsd,
      }
    }
  } catch (error) {
    return null
  }
}

const fetchFeesForChain = async (
  config: ChainConfig,
  startTimestamp: number,
  endTimestamp: number
): Promise<Fees[]> => {
  const events = await getPortalEventsFromExplorer(config, startTimestamp, endTimestamp)

  const feePromises = events.map(event => constructFeeFromEvent(config, event))
  const feeResults = await Promise.allSettled(feePromises)

  const fees = feeResults
    .filter((r): r is PromiseFulfilledResult<Fees | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((fee): fee is Fees => fee !== null)

  return fees.sort((a, b) => b.timestamp - a.timestamp)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  await assetDataService.ensureLoadedAsync()

  const overallStart = Date.now()
  const allFees: Fees[] = []
  const threshold = getCacheableThreshold()
  const { cacheableDates, recentStart } = splitDateRange(startTimestamp, endTimestamp, threshold)

  let cacheHits = 0
  let cacheMisses = 0

  const results = await Promise.allSettled(
    CHAIN_CONFIGS.map(async config => {
      const cachedFees: Fees[] = []
      const datesToFetch: string[] = []

      for (const date of cacheableDates) {
        const cached = tryGetCachedFees('portals', config.chainId, date)
        if (cached) {
          cachedFees.push(...cached)
          cacheHits++
        } else {
          datesToFetch.push(date)
          cacheMisses++
        }
      }

      const newFees: Fees[] = []
      if (datesToFetch.length > 0) {
        const fetchStart = getDateStartTimestamp(datesToFetch[0])
        const fetchEnd = getDateEndTimestamp(datesToFetch[datesToFetch.length - 1])
        const fetched = await fetchFeesForChain(config, fetchStart, fetchEnd)

        const feesByDate = groupFeesByDate(fetched)
        for (const date of datesToFetch) {
          saveCachedFees('portals', config.chainId, date, feesByDate[date] || [])
        }
        newFees.push(...fetched)
      }

      const recentFees: Fees[] = []
      if (recentStart !== null) {
        recentFees.push(...(await fetchFeesForChain(config, recentStart, endTimestamp)))
      }

      return [...cachedFees, ...newFees, ...recentFees]
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allFees.push(...result.value)
    }
  }

  const overallTime = Date.now() - overallStart
  console.log(
    `[portals] Total: ${allFees.length} fees in ${overallTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return allFees
}
