import axios from 'axios'
import { LRUCache } from 'lru-cache'

import {
  ERC20_TRANSFER_TOPIC,
  isNativeAddress,
  REQUEST_TIMEOUT_MS,
  EVM_CHAIN_BY_SOURCE_CHAIN_ID,
  SAME_CHAIN_FEE_RECEIVERS,
  SAME_CHAIN_ROUTERS,
} from './constants'
import type { EvmLog, TransactionReceipt, Transfer, UnchainedTx } from './types'

const feeCache = new LRUCache<string, string>({
  max: 50_000,
  ttl: 1000 * 60 * 60 * 24 * 365, // 1 year — settled tx data never changes
  updateAgeOnGet: true,
})

export const extractFee = (
  transfers: Transfer[],
  routers: Set<string>,
  receivers: Set<string>,
  tokenAddress?: string
): bigint => {
  let sum = BigInt(0)
  for (const t of transfers) {
    if (tokenAddress?.toLowerCase() && (t.contract ?? '').toLowerCase() !== tokenAddress.toLowerCase()) continue
    if (!routers.has((t.from ?? '').toLowerCase())) continue
    if (!receivers.has((t.to ?? '').toLowerCase())) continue
    sum += BigInt(t.value ?? '0')
  }
  return sum
}

const topicToAddress = (topic: string): string => `0x${topic.slice(26).toLowerCase()}`

const transfersFromLogs = (logs: EvmLog[]): Transfer[] => {
  return logs
    .filter(log => log.topics[0] === ERC20_TRANSFER_TOPIC && log.topics.length === 3)
    .map(log => ({
      contract: log.address,
      from: topicToAddress(log.topics[1]),
      to: topicToAddress(log.topics[2]),
      value: BigInt(log.data).toString(),
    }))
}

const getReceipt = async (baseUrl: string, txid: string): Promise<TransactionReceipt | null> => {
  const body = { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txid] }
  const { data } = await axios.post<{ result: TransactionReceipt | null; error?: { message: string } }>(
    `${baseUrl}/api/v1/jsonrpc`,
    body,
    { timeout: REQUEST_TIMEOUT_MS }
  )
  if (data.error) throw new Error(`RPC error: ${data.error.message}`)
  return data.result
}

export const resolveSameChainFee = async (
  chainId: string,
  txid: string,
  sourceTokenAddress: string
): Promise<bigint | null> => {
  const { url } = EVM_CHAIN_BY_SOURCE_CHAIN_ID[chainId] ?? {}
  if (!url) return null

  const key = `${chainId}:${txid}`
  const cached = feeCache.get(key)
  if (cached !== undefined) return BigInt(cached)

  try {
    const fee = await (async () => {
      if (isNativeAddress(sourceTokenAddress)) {
        const { data: tx } = await axios.get<UnchainedTx>(`${url}/api/v1/tx/${txid}`, { timeout: REQUEST_TIMEOUT_MS })
        return Array.isArray(tx.internalTxs)
          ? extractFee(tx.internalTxs, SAME_CHAIN_ROUTERS, SAME_CHAIN_FEE_RECEIVERS)
          : null
      } else {
        const receipt = await getReceipt(url, txid)
        return receipt
          ? extractFee(
              transfersFromLogs(receipt.logs),
              SAME_CHAIN_ROUTERS,
              SAME_CHAIN_FEE_RECEIVERS,
              sourceTokenAddress
            )
          : null
      }
    })()

    if (fee !== null) feeCache.set(key, fee.toString())
    return fee
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[butterswap] on-chain fee lookup failed for ${key}: ${message}`)
    return null
  }
}
