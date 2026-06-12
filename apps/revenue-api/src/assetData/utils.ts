import axios from 'axios'

import { COINGECKO_CHAINS } from '../affiliateRevenue/constants'

import type { Asset } from './types'

type GeneratedAssetData = {
  byId: Record<string, Asset>
}

type CoinGeckoCoinResponse = {
  symbol?: string
  name?: string
  image?: { thumb?: string; small?: string; large?: string }
  detail_platforms?: Record<string, { decimal_place?: number }>
}

export const fetchAssetData = async (): Promise<Record<string, Asset>> => {
  try {
    const { data } = await axios.get<GeneratedAssetData>(
      'https://raw.githubusercontent.com/shapeshift/web/develop/public/generated/generatedAssetData.json',
      { timeout: 30_000 }
    )

    if (!data?.byId || typeof data.byId !== 'object') {
      throw new Error('Invalid asset data structure: missing byId map')
    }

    return data.byId
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to fetch asset data: ${message}`)
  }
}

export const fetchCoingeckoAsset = async (assetId: string): Promise<Asset | undefined> => {
  const [chainId, tokenPart] = assetId.split('/')
  if (!chainId || !tokenPart?.startsWith('erc20:')) return

  const address = tokenPart.replace('erc20:', '')

  const chain = COINGECKO_CHAINS[chainId]
  if (!chain) {
    console.log(`[AssetDataService] No CoinGecko chain found: ${chainId} - add to COINGECKO_CHAINS`)
    return
  }

  const platform = chain.platform
  const url = `https://api.proxy.shapeshift.com/api/v1/markets/coins/${platform}/contract/${address}`

  let data: CoinGeckoCoinResponse
  try {
    ;({ data } = await axios.get<CoinGeckoCoinResponse>(url, {
      timeout: 30_000,
    }))
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return
    throw error
  }

  const precision = data.detail_platforms?.[platform]?.decimal_place
  if (typeof precision !== 'number') {
    console.log(`[AssetDataService] No precision return from CoinGecko for: ${assetId}`)
    return
  }

  const symbol = data.symbol?.toUpperCase() ?? ''

  console.log(`[AssetDataService] Asset fetched from CoinGecko: ${assetId} (symbol: ${symbol}, decimals: ${precision})`)

  return { assetId, chainId, symbol, precision, name: '', color: '', icon: '' }
}
