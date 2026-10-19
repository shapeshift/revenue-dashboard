import axios from 'axios'

import { withRetry } from '../../utils/retry'
import { DAO_TREASURY_ETHEREUM, ETHEREUM_CHAIN_ID } from '../constants'
import { enrichFeesWithUsdPrices } from '../enrichment'
import type { Fees } from '../types'
import { buildAssetId, getCachedFees, getUnchainedBaseUrl, UNCHAINED_PAGE_SIZE } from '../utils'
import type { UnchainedTxHistoryResponse } from '../utils'
import { createAlchemyClient } from '../utils/alchemy'

export const UNCHAINED_BASE_URL = getUnchainedBaseUrl(ETHEREUM_CHAIN_ID)

export const BOB_GATEWAY_FIRST_FEE_BLOCK = 25288446
export const BOB_GATEWAY_METHOD_SELECTORS: Record<string, string> = {
  '0xd7ff3ef6': 'releaseFundsAndCallStrategy',
  '0xf6a1eaad': 'finalizeOfframpOrder',
}
// BOB pays every affiliate fee in USDT on Ethereum; anything else means the tracker's assumptions broke
export const BOB_GATEWAY_FEE_TOKEN = '0xdac17f958d2ee523a2206206994597c13d831ec7'

const fetchFeesFromUnchained = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const fees: Fees[] = []

  const client = createAlchemyClient(ETHEREUM_CHAIN_ID, 'bobgateway')
  const [fromBlock, toBlock] = await Promise.all([
    client.resolveBlock(startTimestamp),
    client.resolveBlock(endTimestamp),
  ])

  // Skip everything before BOB's first fee; bail early if the window predates it entirely.
  const effectiveFromBlock = Math.max(fromBlock, BOB_GATEWAY_FIRST_FEE_BLOCK)
  if (effectiveFromBlock > toBlock) return fees

  let cursor: string | undefined
  do {
    const { data } = await withRetry('bobgateway/unchained', () =>
      axios.get<UnchainedTxHistoryResponse>(`${UNCHAINED_BASE_URL}/api/v1/account/${DAO_TREASURY_ETHEREUM}/txs`, {
        params: {
          pageSize: UNCHAINED_PAGE_SIZE,
          from: effectiveFromBlock,
          to: toBlock,
          ...(cursor ? { cursor } : {}),
        },
      })
    )

    for (const tx of data.txs) {
      if (tx.status !== 1) continue
      if (tx.timestamp < startTimestamp || tx.timestamp > endTimestamp) continue

      const selector = (tx.inputData ?? '').slice(0, 10).toLowerCase()

      const method = BOB_GATEWAY_METHOD_SELECTORS[selector]
      if (!method) continue

      const feeTransfer = tx.tokenTransfers?.find(t => t.to.toLowerCase() === DAO_TREASURY_ETHEREUM.toLowerCase())

      if (!feeTransfer) {
        throw new Error(`no ERC-20 affiliate fee to treasury in ${tx.txid} (${method}) — fee asset may have changed`)
      }

      if (feeTransfer.contract.toLowerCase() !== BOB_GATEWAY_FEE_TOKEN) {
        throw new Error(
          `affiliate fee in ${feeTransfer.symbol} (${feeTransfer.contract}) instead of USDT in ${tx.txid} (${method}) — fee asset changed`
        )
      }

      fees.push({
        chainId: ETHEREUM_CHAIN_ID,
        assetId: buildAssetId(ETHEREUM_CHAIN_ID, feeTransfer.contract),
        service: 'bobgateway',
        txHash: tx.txid,
        timestamp: tx.timestamp,
        amount: feeTransfer.value,
      })
    }

    cursor = data.cursor
  } while (cursor)

  return fees.sort((a, b) => b.timestamp - a.timestamp)
}

export const getFees = async (startTimestamp: number, endTimestamp: number): Promise<Fees[]> => {
  const startTime = Date.now()

  const { fees, cacheHits, cacheMisses } = await getCachedFees(
    'bobgateway',
    ETHEREUM_CHAIN_ID,
    startTimestamp,
    endTimestamp,
    fetchFeesFromUnchained
  )

  const duration = Date.now() - startTime
  console.log(
    `[bobgateway] Total: ${fees.length} fees in ${duration}ms | Cache: ${cacheHits} hits, ${cacheMisses} misses`
  )

  return enrichFeesWithUsdPrices(fees)
}
