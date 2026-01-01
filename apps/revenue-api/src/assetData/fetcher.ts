import axios from 'axios'

import type { EncodedAssetData } from './types'

const GITHUB_URL =
  'https://raw.githubusercontent.com/shapeshift/agentic-chat/main/packages/utils/src/assetData/encodedAssetData.json'
const FETCH_TIMEOUT_MS = 30000

export const fetchAssetData = async (): Promise<EncodedAssetData> => {
  try {
    const { data } = await axios.get<EncodedAssetData>(GITHUB_URL, {
      timeout: FETCH_TIMEOUT_MS,
    })

    if (!data.assetIdPrefixes || !data.encodedAssetIds || !data.encodedAssets) {
      throw new Error('Invalid asset data structure received from GitHub')
    }

    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to fetch asset data from GitHub: ${message}`)
  }
}
