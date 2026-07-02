import axios from 'axios'

import { assetDataService } from '../assetData/AssetDataService'
import { bnOrZero } from '../lib/bignumber'
import { buildSettlement } from '../partnerRevenue/settle'
import { fetchAffiliateRegistry, fetchPartnerSwaps } from '../partnerRevenue/swapServiceClient'
import type { SettlementResult } from '../partnerRevenue/types'
import type { AffiliateRevenueResponse, AssetRevenue, PartnerRevenueResponse, Service } from '../types'
import { services } from '../types'

import * as avnu from './avnu'
import * as bebop from './bebop'
import * as bobgateway from './bobgateway'
import * as butterswap from './butterswap'
import { timestampToDate } from './cache'
import * as chainflip from './chainflip'
import { getAffiliateFeeRate } from './constants'
import * as cowswap from './cowswap'
import * as jupiter from './jupiter'
import * as mayachain from './mayachain'
import * as nearintents from './nearIntents'
import * as portals from './portals'
import * as relay from './relay'
import * as thorchain from './thorchain'
import { baseUnitToTokenAmount } from './utils'
import * as zrx from './zrx'

const providerNames: Service[] = [
  'avnu',
  'bebop',
  'bobgateway',
  'butterswap',
  'chainflip',
  'cowswap',
  'jupiter',
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
  'eip155:9745': 'Plasma',
  'eip155:999': 'HyperEVM',
  'eip155:747474': 'Katana',

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
  'ton:mainnet': 'TON',
  'aptos:1': 'Aptos',

  // Cosmos chains
  'cosmos:thorchain-1': 'THORChain',
  'cosmos:mayachain-mainnet-v1': 'MAYAChain',
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
  synthetic?: boolean // settlement-only negative adjustment; excluded from counts + asset breakdown
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
      volumeUsd: 0,
      feeCount: 0,
      byService: Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>,
      byServiceFeeCount: Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>,
    }
  }
  return byAsset[assetId]
}

export class AffiliateRevenue {
  private async collectFees(
    startTimestamp: number,
    endTimestamp: number
  ): Promise<{ fees: Fees[]; failedProviders: Service[] }> {
    const fees: Array<Fees> = []
    const failedProviders: Service[] = []

    const results = await Promise.allSettled([
      avnu.getFees(startTimestamp, endTimestamp),
      bebop.getFees(startTimestamp, endTimestamp),
      bobgateway.getFees(startTimestamp, endTimestamp),
      butterswap.getFees(startTimestamp, endTimestamp),
      chainflip.getFees(startTimestamp, endTimestamp),
      cowswap.getFees(startTimestamp, endTimestamp),
      jupiter.getFees(startTimestamp, endTimestamp),
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

    return { fees, failedProviders }
  }

  private async settle(fees: Fees[], startTimestamp: number, endTimestamp: number): Promise<SettlementResult> {
    const startDate = timestampToDate(startTimestamp)
    const endDate = timestampToDate(endTimestamp)
    try {
      const partnerSwaps = await fetchPartnerSwaps(startDate, endDate)
      return buildSettlement(fees, partnerSwaps)
    } catch (error) {
      console.error(`[AffiliateRevenue] partner settlement failed: ${formatError(error)}`)
      // graceful: no peeling, empty partner ledger
      return { netFees: fees, byPartner: {}, partnerTotalUsd: 0, unreconciled: { count: 0, usd: 0 } }
    }
  }

  async getAffiliateRevenue(startTimestamp: number, endTimestamp: number): Promise<AffiliateRevenueResponse> {
    assetDataService.resetMissLog()

    const { fees, failedProviders } = await this.collectFees(startTimestamp, endTimestamp)
    const settlement = await this.settle(fees, startTimestamp, endTimestamp)

    const byDate: AffiliateRevenueResponse['byDate'] = {}
    const byAsset: Record<string, AssetRevenue> = {}

    for (const fee of settlement.netFees) {
      const date = timestampToDate(fee.timestamp)
      const amountUsd = parseFloat(fee.amountUsd || '0')

      if (!byDate[date]) {
        byDate[date] = {
          totalUsd: 0,
          totalVolumeUsd: 0,
          totalFeeCount: 0,
          byService: Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>,
          byServiceVolume: Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>,
          byServiceFeeCount: Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>,
          byAsset: {},
        }
      }

      byDate[date].totalUsd += amountUsd
      byDate[date].totalVolumeUsd += amountUsd / getAffiliateFeeRate(fee.timestamp)
      byDate[date].byService[fee.service] += amountUsd
      byDate[date].byServiceVolume[fee.service] += amountUsd / getAffiliateFeeRate(fee.timestamp)

      if (!fee.synthetic) {
        byDate[date].totalFeeCount += 1
        byDate[date].byServiceFeeCount[fee.service] += 1
      }

      if (!fee.synthetic) {
        const asset = await assetDataService.getAsset(fee.assetId)

        const symbol = asset?.symbol || 'UNKNOWN'
        const decimals = asset?.precision ?? 18
        const chainName = getChainName(fee.chainId)

        const feeTokenAmount = baseUnitToTokenAmount(fee.amount, decimals)

        // Daily asset aggregation
        const dailyAsset = getOrCreateAssetRevenue(byDate[date].byAsset!, fee.assetId, symbol, fee.chainId, chainName)
        dailyAsset.tokenAmount = bnOrZero(dailyAsset.tokenAmount).plus(bnOrZero(feeTokenAmount)).toFixed(decimals)
        dailyAsset.amountUsd += amountUsd
        dailyAsset.volumeUsd += amountUsd / getAffiliateFeeRate(fee.timestamp)
        dailyAsset.feeCount += 1
        dailyAsset.byService[fee.service] += amountUsd
        dailyAsset.byServiceFeeCount[fee.service] += 1

        // Global asset aggregation
        const globalAsset = getOrCreateAssetRevenue(byAsset, fee.assetId, symbol, fee.chainId, chainName)
        globalAsset.tokenAmount = bnOrZero(globalAsset.tokenAmount).plus(bnOrZero(feeTokenAmount)).toFixed(decimals)
        globalAsset.amountUsd += amountUsd
        globalAsset.volumeUsd += amountUsd / getAffiliateFeeRate(fee.timestamp)
        globalAsset.feeCount += 1
        globalAsset.byService[fee.service] += amountUsd
        globalAsset.byServiceFeeCount[fee.service] += 1
      }
    }

    const byService = Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>
    const byServiceVolume = Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>
    const byServiceFeeCount = Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>

    for (const daily of Object.values(byDate)) {
      for (const service of services) {
        byService[service] += daily.byService[service]
        byServiceVolume[service] += daily.byServiceVolume[service]
        byServiceFeeCount[service] += daily.byServiceFeeCount[service]
      }
    }

    const totalUsd = Object.values(byDate).reduce((sum, daily) => sum + daily.totalUsd, 0)
    const totalVolumeUsd = Object.values(byDate).reduce((sum, daily) => sum + daily.totalVolumeUsd, 0)
    const totalFeeCount = Object.values(byDate).reduce((sum, daily) => sum + daily.totalFeeCount, 0)

    return {
      totalUsd,
      totalVolumeUsd,
      totalFeeCount,
      byService,
      byServiceVolume,
      byServiceFeeCount,
      byDate,
      byAsset,
      failedProviders,
      unreconciled: settlement.unreconciled,
    }
  }

  async getPartnerRevenue(startTimestamp: number, endTimestamp: number): Promise<PartnerRevenueResponse> {
    const { fees } = await this.collectFees(startTimestamp, endTimestamp)
    const settlement = await this.settle(fees, startTimestamp, endTimestamp)

    let affiliates: PartnerRevenueResponse['affiliates'] = []
    try {
      affiliates = await fetchAffiliateRegistry()
    } catch (error) {
      console.error(`[PartnerRevenue] registry fetch failed: ${formatError(error)}`)
    }

    return {
      byPartner: settlement.byPartner,
      partnerTotalUsd: settlement.partnerTotalUsd,
      unreconciled: settlement.unreconciled,
      affiliates,
    }
  }
}
