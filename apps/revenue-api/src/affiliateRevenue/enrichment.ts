import { assetDataService } from '../assetData/AssetDataService'

import { getBulkAssetPrices } from './priceCache'

import type { Fees } from './index'

/**
 * Price Enrichment Strategy
 *
 * This function INTENTIONALLY recalculates USD values using CURRENT prices instead of historical prices.
 *
 * WHY? The dashboard shows "today's value" of earned revenue, not historical value.
 * - Example: If we earned 1 ETH on Jan 1 when ETH = $2000, but today ETH = $3000
 * - Dashboard shows: $3000 (current value) ✓
 * - NOT: $2000 (historical value) ✗
 *
 * This provides better insight into:
 * - Current portfolio value of accumulated fees
 * - Real-time performance tracking
 * - Meaningful comparisons across time periods
 *
 * IMPORTANT: Original USD values (from integration APIs) are preserved in `originalUsdValue`
 * for audit/debugging purposes, but the dashboard uses the enriched `amountUsd` (current prices).
 *
 * NOTE: This is NOT a bug - it's a deliberate design decision for dashboard reporting.
 */
export const enrichFeesWithUsdPrices = async (fees: Fees[]): Promise<Fees[]> => {
  if (fees.length === 0) return fees

  // Extract unique asset IDs
  const uniqueAssetIds = [...new Set(fees.map(f => f.assetId))]

  // Batch fetch prices
  const priceMap = await getBulkAssetPrices(uniqueAssetIds)

  const enrichedFees = await Promise.all(
    fees.map(async fee => {
      const price = priceMap.get(fee.assetId)

      // IMPORTANT: Move existing amountUsd → originalUsdValue (if not already set)
      // This preserves what the integration calculated
      if (fee.amountUsd && !fee.originalUsdValue) {
        fee.originalUsdValue = fee.amountUsd
      }

      const asset = await assetDataService.getAsset(fee.assetId)

      // Calculate NEW amountUsd from live prices when we know the asset's decimals
      if (price !== null && price !== undefined && asset) {
        const amountDecimal = Number(fee.amount) / 10 ** asset.precision
        fee.amountUsd = (amountDecimal * price).toString()
      } else {
        // No price or unknown asset - fall back to what the integration calculated
        fee.amountUsd = fee.originalUsdValue
      }

      return fee
    })
  )

  return enrichedFees
}
