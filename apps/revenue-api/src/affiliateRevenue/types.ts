import type { Service } from '../types'

export type Fees = {
  amount: string
  amountUsd?: string
  originalUsdValue?: string
  assetId: string
  chainId: string
  service: Service
  timestamp: number
  txHash: string
  synthetic?: boolean // reconciliation-only negative adjustment; nets USD + crypto but excluded from fee counts
}

export type PartnerSwap = {
  swapId: string
  status: string
  partnerCode: string
  swapperName: string
  sellTxHash: string | null
  buyTxHash: string | null
  partnerBps: number
  affiliateBps: number | null
  verifiedBps: number | null
  feeUsd: string | null
  partnerFeeUsd: string | null
  volumeUsd: string | null
  affiliateFeeAssetId: string | null
  affiliateFeeAmountCryptoBaseUnit: string | null
  date: string
}

// A partner swap left out of revenue (not payable, unmapped, or its provider failed) — logged with
// identifiers so the underlying swaps can be inspected.
export type ExcludedPartnerSwap = {
  swapId: string
  partnerCode: string
  swapperName: string
  reason: string
  partnerFeeUsd: number // the fee we're NOT counting — for logging $ impact
}

export type PartnerRevenue = {
  partnerCode: string
  totalUsd: number
  totalVolumeUsd: number
  swapCount: number
  byService: Record<string, number>
  byDate: Record<string, number>
}

export type ReconciliationResult = {
  netFees: Fees[]
  excluded: ExcludedPartnerSwap[]
}
