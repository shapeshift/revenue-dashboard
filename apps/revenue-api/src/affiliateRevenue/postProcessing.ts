import { assetDataService } from './assetDataService'
import { getBulkAssetPrices } from './priceCache'

import type { Fees } from './index'

const SERVICES_WITH_API_PROVIDED_USD = ['chainflip', 'butterswap']

const shouldPreserveApiUsd = (service: string): boolean => {
  return SERVICES_WITH_API_PROVIDED_USD.includes(service)
}

export const enrichFeesWithUsdPrices = async (fees: Fees[]): Promise<Fees[]> => {
  const assetIds = new Set(fees.map(f => f.assetId))

  await assetDataService.ensureLoadedAsync()

  const priceMap = await getBulkAssetPrices(Array.from(assetIds))

  const debugMode = process.env.DEBUG_USD_CALC === 'true'

  return fees.map(fee => {
    // If amountUsd already set (per-transaction decision), preserve it
    if (fee.amountUsd !== undefined) {
      return fee
    }

    // For services with no amounts (chainflip, butterswap), preserve originalUsdValue
    if (shouldPreserveApiUsd(fee.service)) {
      return { ...fee, amountUsd: fee.originalUsdValue }
    }

    const price = priceMap.get(fee.assetId)

    // If no price found, use original USD as fallback
    if (!price) {
      if (fee.originalUsdValue) {
        if (debugMode) {
          console.log(`[priceCache] Using fallback USD for ${fee.assetId}`)
        }
        return { ...fee, amountUsd: fee.originalUsdValue }
      }
      return { ...fee, amountUsd: undefined }
    }

    const decimals = assetDataService.getAssetDecimals(fee.assetId)
    const amountDecimal = Number(fee.amount) / 10 ** decimals
    const calculatedUsd = (amountDecimal * price).toString()

    return { ...fee, amountUsd: calculatedUsd }
  })
}
