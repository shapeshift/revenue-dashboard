import { assetDataService } from '../utils/assetDataService'

import { getBulkAssetPrices } from './priceCache'

import type { Fees } from './index'

/**
 * Enriches fees with USD prices calculated from live market data.
 *
 * Moves existing amountUsd → originalUsdValue, then recalculates amountUsd
 * using current prices. This preserves integration-provided values while
 * standardizing on live prices.
 *
 * NOTE: Integrations continue to work unchanged - this function runs centrally
 * after all fees are collected.
 */
export const enrichFeesWithUsdPrices = async (fees: Fees[]): Promise<Fees[]> => {
  if (fees.length === 0) return fees

  // Extract unique asset IDs
  const uniqueAssetIds = [...new Set(fees.map(f => f.assetId))]

  // Batch fetch prices
  const priceMap = await getBulkAssetPrices(uniqueAssetIds)

  // Ensure asset data loaded
  await assetDataService.ensureLoadedAsync()

  // Enrich each fee
  let enrichedCount = 0
  let missingPriceCount = 0

  const enrichedFees = await Promise.all(
    fees.map(async fee => {
      const price = priceMap.get(fee.assetId)

      // IMPORTANT: Move existing amountUsd → originalUsdValue (if not already set)
      // This preserves what the integration calculated
      if (fee.amountUsd && !fee.originalUsdValue) {
        fee.originalUsdValue = fee.amountUsd
      }

      // Calculate NEW amountUsd from live prices
      if (price !== null && price !== undefined) {
        const decimals = await assetDataService.getAssetDecimals(fee.assetId)
        const amountDecimal = Number(fee.amount) / 10 ** decimals
        const calculatedUsd = (amountDecimal * price).toString()

        fee.amountUsd = calculatedUsd
        enrichedCount++
      } else {
        // Fallback to originalUsdValue (what integration calculated)
        if (fee.originalUsdValue) {
          fee.amountUsd = fee.originalUsdValue
          enrichedCount++
        } else {
          // No price AND no original value - set undefined
          fee.amountUsd = undefined
          missingPriceCount++
        }
      }

      return fee
    })
  )

  return enrichedFees
}
