import { assetDataService } from '../assetData/AssetDataService'

import { getHistoricalPriceUsd } from './historicalPrices'
import type { Fees } from './types'

// A provider's own USD is priced at swap time, so only fees without one are priced, at the fee's timestamp
export const enrichFeesWithUsdPrices = async (fees: Fees[]): Promise<Fees[]> =>
  Promise.all(
    fees.map(async fee => {
      if (Number(fee.amountUsd) > 0) return fee

      const [price, asset] = await Promise.all([
        getHistoricalPriceUsd(fee.assetId, fee.timestamp),
        assetDataService.getAsset(fee.assetId),
      ])
      if (price === null || !asset) return fee

      return { ...fee, amountUsd: ((Number(fee.amount) / 10 ** asset.precision) * price).toString() }
    })
  )
