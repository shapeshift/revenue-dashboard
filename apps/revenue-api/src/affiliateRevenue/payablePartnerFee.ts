import { bnOrZero } from '../lib/bignumber'

import type { PartnerSwap } from './types'

const BPS_DENOMINATOR = 10_000
const FEE_DEVIATION_TOLERANCE = 0.25

export type PayablePartnerFee =
  | { payable: true; partnerFeeUsd: number; partnerFeeCryptoBaseUnit: string; assetId: string }
  | { payable: false; reason: string }

// A partner swap represents real, payable revenue — the same basis the payout script pays on — only
// when it SUCCEEDED and was verified on-chain with a real affiliate-fee amount + verified bps, and
// that on-chain fee isn't anomalous vs the bps-implied fee. Anything else is excluded (with a reason
// for audit) so we never over- or under-state partner revenue.
export function getPayablePartnerFee(swap: PartnerSwap): PayablePartnerFee {
  if (swap.status !== 'SUCCESS') return { payable: false, reason: 'swap not SUCCESS' }
  if (!swap.affiliateFeeAssetId) return { payable: false, reason: 'no affiliate-fee asset' }
  if (!swap.affiliateFeeAmountCryptoBaseUnit) return { payable: false, reason: 'no on-chain affiliate-fee amount' }
  if (!swap.verifiedBps || swap.verifiedBps <= 0) return { payable: false, reason: 'no verified on-chain bps' }
  if (swap.partnerBps < 0) return { payable: false, reason: 'invalid partner bps' }

  const partnerFeeUsd = bnOrZero(swap.partnerFeeUsd)
  if (partnerFeeUsd.lte(0)) return { payable: false, reason: 'no partner fee' }

  const impliedFeeUsd = bnOrZero(swap.volumeUsd).times(swap.verifiedBps).div(BPS_DENOMINATOR)
  if (impliedFeeUsd.gt(0)) {
    const deviation = bnOrZero(swap.feeUsd).minus(impliedFeeUsd).abs().div(impliedFeeUsd)
    if (deviation.gt(FEE_DEVIATION_TOLERANCE)) {
      // Stable category (no per-swap %) so exclusions group cleanly in the audit log.
      return { payable: false, reason: `fee anomaly (>${FEE_DEVIATION_TOLERANCE * 100}% off bps-implied)` }
    }
  }

  const total = bnOrZero(swap.affiliateFeeAmountCryptoBaseUnit)
  const share = total.times(swap.partnerBps).div(swap.verifiedBps)
  const partnerFeeCryptoBaseUnit = (share.gt(total) ? total : share).toFixed(0)

  return {
    payable: true,
    partnerFeeUsd: partnerFeeUsd.toNumber(),
    partnerFeeCryptoBaseUnit,
    assetId: swap.affiliateFeeAssetId,
  }
}
