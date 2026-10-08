import axios from 'axios'

import { ETHEREUM_CHAIN_ID } from '../constants'
import type { Fees } from '../types'
import { buildAssetId, decimalToBaseUnit, getCachedFees } from '../utils'

import { CHAINFLIP_API_URL, GET_AFFILIATE_SWAPS_QUERY, PAGE_SIZE, SHAPESHIFT_BROKER_ID } from './constants'
import type { GraphQLResponse } from './types'

const fetchFeesFromAPI = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []
  const startDate = new Date(startTimestamp * 1000).toISOString()
  const endDate = new Date(endTimestamp * 1000).toISOString()

  let offset = 0
  let hasNextPage = true
  do {
    const { data } = await axios.post<GraphQLResponse>(CHAINFLIP_API_URL, {
      query: GET_AFFILIATE_SWAPS_QUERY,
      variables: {
        affiliateBrokerId: SHAPESHIFT_BROKER_ID,
        startDate,
        endDate,
        first: PAGE_SIZE,
        offset,
      },
      operationName: 'GetAffiliateSwaps',
    })

    if (!data?.data?.allSwapRequests) {
      throw new Error('Chainflip API returned invalid response structure')
    }

    if ('errors' in data && Array.isArray(data.errors) && data.errors.length > 0) {
      throw new Error(`Chainflip GraphQL errors: ${JSON.stringify(data.errors)}`)
    }

    const { edges, pageInfo } = data.data.allSwapRequests

    if (!edges || !Array.isArray(edges)) {
      throw new Error('Chainflip API returned invalid edges array')
    }

    if (!pageInfo || typeof pageInfo.hasNextPage !== 'boolean') {
      throw new Error('Chainflip API returned invalid pageInfo')
    }

    for (const { node: swap } of edges) {
      if (!swap.affiliateBroker1FeeValueUsd) continue

      const chainId = ETHEREUM_CHAIN_ID
      const assetId = buildAssetId(chainId, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')

      // Chainflip API only provides USD values, not native USDC amounts
      // Since USDC is a stablecoin pegged to $1, we calculate: usdcWei = usdValue * 10^6
      const usdValue = swap.affiliateBroker1FeeValueUsd
      const usdcDecimals = 6
      const usdcWei = decimalToBaseUnit(usdValue, usdcDecimals)

      fees.push({
        chainId,
        assetId,
        service: 'chainflip',
        txHash: '',
        timestamp: Math.floor(new Date(swap.completedBlockTimestamp).getTime() / 1000),
        amount: usdcWei,
        amountUsd: usdValue,
      })
    }

    hasNextPage = pageInfo.hasNextPage
    offset += PAGE_SIZE
  } while (hasNextPage)

  return fees
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()
  const { fees, cacheHits, cacheMisses } = await getCachedFees(
    'chainflip',
    ETHEREUM_CHAIN_ID,
    startTimestamp,
    endTimestamp,
    fetchFeesFromAPI
  )

  console.log(
    `[chainflip] Total: ${fees.length} fees in ${Date.now() - startTime}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return fees
}
