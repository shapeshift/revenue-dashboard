import type { Asset } from '../assetData/types'
import { bnOrZero } from '../lib/bignumber'
import type { AffiliateRevenueResponse, AssetRevenue, PartnerRevenueResponse, Service } from '../types'
import { services } from '../types'
import { timestampToDate } from '../utils/date'

import { getAffiliateFeeRate } from './constants'
import { getPayablePartnerFee } from './payablePartnerFee'
import type { ExcludedPartnerSwap, Fees, PartnerSwap } from './types'
import { baseUnitToTokenAmount } from './utils/amount'

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

// Partner deductions must never drive an asset bucket negative. Best-effort floor (per-asset totals
// aren't the authoritative net — service + grand totals are — so we just clamp, no warning here).
const clampAsset = (asset: AssetRevenue): void => {
  if (asset.amountUsd < 0) asset.amountUsd = 0
  if (asset.volumeUsd < 0) asset.volumeUsd = 0
  if (bnOrZero(asset.tokenAmount).lt(0)) asset.tokenAmount = '0'
  for (const service of services) {
    if (asset.byService[service] < 0) asset.byService[service] = 0
  }
}

// Resolves an assetId to its metadata (symbol/precision). Injected so this stays pure and testable
// without pulling in the network-backed asset service.
export type ResolveAsset = (assetId: string) => Promise<Asset | undefined>

// Aggregate reconciled net fees into the affiliate-revenue response: daily + global rollups,
// per-service and per-asset breakdowns. Synthetic partner adjustments net USD + crypto into the
// totals/asset breakdown but are excluded from fee counts. Any bucket a partner deduction would
// drive below 0 is floored to 0 (never negative revenue); service + grand totals are authoritative
// (floored per date then re-summed), per-asset/-date are best-effort.
export async function aggregateAffiliateRevenue(
  netFees: Fees[],
  failedProviders: Service[],
  resolveAsset: ResolveAsset
): Promise<AffiliateRevenueResponse> {
  const byDate: AffiliateRevenueResponse['byDate'] = {}
  const byAsset: Record<string, AssetRevenue> = {}

  for (const fee of netFees) {
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

    byDate[date].byService[fee.service] += amountUsd
    byDate[date].byServiceVolume[fee.service] += amountUsd / getAffiliateFeeRate(fee.timestamp)

    if (!fee.synthetic) {
      byDate[date].totalFeeCount += 1
      byDate[date].byServiceFeeCount[fee.service] += 1
    }

    const asset = await resolveAsset(fee.assetId)

    const symbol = asset?.symbol || 'UNKNOWN'
    const decimals = asset?.precision ?? 18
    const chainName = getChainName(fee.chainId)

    const feeTokenAmount = baseUnitToTokenAmount(fee.amount, decimals)

    // Daily asset aggregation
    const dailyAsset = getOrCreateAssetRevenue(byDate[date].byAsset!, fee.assetId, symbol, fee.chainId, chainName)
    dailyAsset.tokenAmount = bnOrZero(dailyAsset.tokenAmount).plus(bnOrZero(feeTokenAmount)).toFixed(decimals)
    dailyAsset.amountUsd += amountUsd
    dailyAsset.volumeUsd += amountUsd / getAffiliateFeeRate(fee.timestamp)
    dailyAsset.byService[fee.service] += amountUsd

    // Global asset aggregation
    const globalAsset = getOrCreateAssetRevenue(byAsset, fee.assetId, symbol, fee.chainId, chainName)
    globalAsset.tokenAmount = bnOrZero(globalAsset.tokenAmount).plus(bnOrZero(feeTokenAmount)).toFixed(decimals)
    globalAsset.amountUsd += amountUsd
    globalAsset.volumeUsd += amountUsd / getAffiliateFeeRate(fee.timestamp)
    globalAsset.byService[fee.service] += amountUsd

    if (!fee.synthetic) {
      dailyAsset.feeCount += 1
      dailyAsset.byServiceFeeCount[fee.service] += 1
      globalAsset.feeCount += 1
      globalAsset.byServiceFeeCount[fee.service] += 1
    }
  }

  for (const [date, daily] of Object.entries(byDate)) {
    for (const service of services) {
      if (daily.byService[service] < 0) {
        console.warn(
          `[AffiliateRevenue] ${service} on ${date} netted $${daily.byService[service].toFixed(2)} — floored to 0 (partner deduction exceeded gross)`
        )
        daily.byService[service] = 0
      }
      if (daily.byServiceVolume[service] < 0) daily.byServiceVolume[service] = 0
    }
    daily.totalUsd = services.reduce((sum, s) => sum + daily.byService[s], 0)
    daily.totalVolumeUsd = services.reduce((sum, s) => sum + daily.byServiceVolume[s], 0)
    for (const asset of Object.values(daily.byAsset ?? {})) clampAsset(asset)
  }
  for (const asset of Object.values(byAsset)) clampAsset(asset)

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
  }
}

// Aggregate partner swaps into the per-partner revenue breakdown for the /partner view. Only payable
// swaps (verified on-chain; see getPayablePartnerFee) contribute volume or counts — so we never
// overstate a partner. A verified swap with a genuine 0 affiliate bps is payable but adds $0 revenue,
// so it's counted without inflating the total. Excluded swaps that carry a partner fee are returned
// for audit logging.
export function aggregatePartnerRevenue(
  partnerSwaps: PartnerSwap[],
  affiliates: PartnerRevenueResponse['affiliates']
): { response: PartnerRevenueResponse; excluded: ExcludedPartnerSwap[] } {
  const byPartner: PartnerRevenueResponse['byPartner'] = {}
  const excluded: ExcludedPartnerSwap[] = []

  for (const swap of partnerSwaps) {
    const fee = getPayablePartnerFee(swap)
    if (!fee.payable) {
      if (bnOrZero(swap.partnerFeeUsd).gt(0)) {
        excluded.push({
          swapId: swap.swapId,
          partnerCode: swap.partnerCode,
          swapperName: swap.swapperName,
          reason: fee.reason,
          partnerFeeUsd: bnOrZero(swap.partnerFeeUsd).toNumber(),
        })
      }
      continue
    }

    const partner = (byPartner[swap.partnerCode] ??= {
      partnerCode: swap.partnerCode,
      totalUsd: 0,
      totalVolumeUsd: 0,
      swapCount: 0,
      byService: {},
      byDate: {},
    })

    const volumeUsd = bnOrZero(swap.volumeUsd).toNumber()

    partner.totalUsd += fee.partnerFeeUsd
    partner.totalVolumeUsd += volumeUsd
    partner.swapCount += 1
    partner.byService[swap.swapperName] = (partner.byService[swap.swapperName] ?? 0) + fee.partnerFeeUsd
    partner.byDate[swap.date] = (partner.byDate[swap.date] ?? 0) + fee.partnerFeeUsd
  }

  const partnerTotalUsd = Object.values(byPartner).reduce((sum, partner) => sum + partner.totalUsd, 0)

  return { response: { byPartner, partnerTotalUsd, affiliates }, excluded }
}
