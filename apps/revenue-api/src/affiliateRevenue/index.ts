import axios from 'axios'

import { bnOrZero } from '../lib/bignumber'
import type { AffiliateRevenueResponse, AssetRevenue, Service } from '../types'
import { services } from '../types'
import { assetDataService } from '../utils/assetDataService'

import * as bebop from './bebop'
import * as butterswap from './butterswap'
import { timestampToDate } from './cache'
import * as chainflip from './chainflip'
import * as mayachain from './mayachain'
import * as nearintents from './nearIntents'
import * as portals from './portals'
import * as relay from './relay'
import * as thorchain from './thorchain'
import { baseUnitToTokenAmount } from './utils'
import * as zrx from './zrx'

const providerNames: Service[] = [
  'bebop',
  'butterswap',
  'chainflip',
  'mayachain',
  'nearintents',
  'portals',
  'relay',
  'thorchain',
  'zrx',
]

const chainMap: Record<string, string> = {
  // EVM chains
  'eip155:1': 'Ethereum',
  'eip155:10': 'Optimism',
  'eip155:8453': 'Base',
  'eip155:42161': 'Arbitrum',
  'eip155:137': 'Polygon',
  'eip155:56': 'BSC',
  'eip155:100': 'Gnosis',
  'eip155:43114': 'Avalanche',
  'eip155:22776': 'MAP Protocol',
  'eip155:143': 'Monad',
  'eip155:9745': 'Monad Testnet',
  'eip155:999': 'Zora Sepolia',
  'eip155:747474': 'Flow Testnet',

  // Bitcoin-based chains
  'bip122:000000000019d6689c085ae165831e93': 'Bitcoin',
  'bip122:00000000001a91e3dace36e2be3bf030': 'Dogecoin',
  'bip122:00040fe8ec8471911baa1db1266ea15d': 'Zcash',

  // Other chains
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 'Solana',
  'tron:0x2b6653dc': 'Tron',
  'sui:35834a8a': 'Sui',
  'near:mainnet': 'Near',
  'starknet:SN_MAIN': 'Starknet',

  // Cosmos chains
  'cosmos:thorchain-1': 'THORChain',
  'cosmos:mayachain-mainnet-v1': 'Maya',
}

const getChainName = (chainId: string): string => chainMap[chainId] || chainId

const formatError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 'no response'
    const data = error.response?.data
    const message = typeof data === 'object' ? JSON.stringify(data) : (data ?? error.message)
    return `HTTP ${status}: ${message}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export type Fees = {
  amount: string
  amountUsd?: string
  originalUsdValue?: string
  assetId: string
  chainId: string
  service: Service
  timestamp: number
  txHash: string
}

const getOrCreateAssetRevenue = (
  byAsset: Record<string, AssetRevenue>,
  assetId: string,
  symbol: string,
  chainId: string,
  chainName: string
): AssetRevenue => {
  if (!byAsset[assetId]) {
    byAsset[assetId] = {
      symbol,
      chainId,
      chainName,
      assetId,
      tokenAmount: '0',
      amountUsd: 0,
      byService: Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>,
    }
  }
  return byAsset[assetId]
}

export class AffiliateRevenue {
  async getAffiliateRevenue(startTimestamp: number, endTimestamp: number): Promise<AffiliateRevenueResponse> {
    await assetDataService.ensureLoadedAsync()

    const fees: Array<Fees> = []
    const failedProviders: Service[] = []

    const results = await Promise.allSettled([
      bebop.getFees(startTimestamp, endTimestamp),
      butterswap.getFees(startTimestamp, endTimestamp),
      chainflip.getFees(startTimestamp, endTimestamp),
      mayachain.getFees(startTimestamp, endTimestamp),
      nearintents.getFees(startTimestamp, endTimestamp),
      portals.getFees(startTimestamp, endTimestamp),
      relay.getFees(startTimestamp, endTimestamp),
      thorchain.getFees(startTimestamp, endTimestamp),
      zrx.getFees(startTimestamp, endTimestamp),
    ])

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        fees.push(...result.value)
      } else {
        const provider = providerNames[index]
        failedProviders.push(provider)
        console.error(`[AffiliateRevenue] ${provider} failed: ${formatError(result.reason)}`)
      }
    })

    const byDate: AffiliateRevenueResponse['byDate'] = {}
    const byAsset: Record<string, AssetRevenue> = {}

    for (const fee of fees) {
      const date = timestampToDate(fee.timestamp)
      const amountUsd = parseFloat(fee.amountUsd || '0')
      const asset = assetDataService.getAsset(fee.assetId)

      const symbol = asset?.symbol || 'UNKNOWN'

      // Use the same getAssetDecimals() that providers use to ensure consistency
      // IMPORTANT: Must use same parameters as providers (useCoinGeckoFallback = true by default)
      const decimals = await assetDataService.getAssetDecimals(fee.assetId)

      const chainName = getChainName(fee.chainId)

      if (!byDate[date]) {
        byDate[date] = {
          totalUsd: 0,
          byService: Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>,
          byAsset: {},
        }
      }

      byDate[date].totalUsd += amountUsd
      byDate[date].byService[fee.service] += amountUsd

      const feeTokenAmount = baseUnitToTokenAmount(fee.amount, decimals)

      // Daily asset aggregation
      const dailyAsset = getOrCreateAssetRevenue(byDate[date].byAsset!, fee.assetId, symbol, fee.chainId, chainName)
      dailyAsset.tokenAmount = bnOrZero(dailyAsset.tokenAmount).plus(bnOrZero(feeTokenAmount)).toFixed(18)
      dailyAsset.amountUsd += amountUsd
      dailyAsset.byService[fee.service] += amountUsd

      // Global asset aggregation
      const globalAsset = getOrCreateAssetRevenue(byAsset, fee.assetId, symbol, fee.chainId, chainName)
      globalAsset.tokenAmount = bnOrZero(globalAsset.tokenAmount).plus(bnOrZero(feeTokenAmount)).toFixed(18)
      globalAsset.amountUsd += amountUsd
      globalAsset.byService[fee.service] += amountUsd
    }

    const byService = Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>

    for (const daily of Object.values(byDate)) {
      for (const service of services) {
        byService[service] += daily.byService[service]
      }
    }

    const totalUsd = Object.values(byDate).reduce((sum, daily) => sum + daily.totalUsd, 0)

    return {
      totalUsd,
      byService,
      byDate,
      byAsset,
      failedProviders,
    }
  }
}
