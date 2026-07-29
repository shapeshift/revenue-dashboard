import axios from 'axios'

import type { Service } from '../../types'
import { withRetry } from '../../utils/retry'
import type { Fees } from '../types'

import { buildAssetId } from './asset'
import { getBlockByTimestamp } from './dateToBlock'
import { getUnchainedBaseUrl, UNCHAINED_PAGE_SIZE } from './unchained'
import type { UnchainedTx, UnchainedTxHistoryResponse } from './unchained'

export type TreasuryFeesParams = {
  service: Service
  chainId: string
  treasury: string
  // Contracts/EOAs whose transfers into the treasury count as this service's affiliate revenue (case insensitive)
  senders: Iterable<string>
  startTimestamp: number
  endTimestamp: number
  // Skip blocks before the service's first possible fee
  firstBlock?: number
}

/**
 * Fetch the fees a service paid into a treasury, by scanning the treasury's
 * tx history for transfers sent by a known set of contracts.
 *
 * Sender + recipient is the whole discriminator: anything one of these contracts
 * sends the treasury is our fee, whether it arrives as native (an internal tx) or
 * as an ERC20 (a token transfer). Services differ in which of the two they
 * normally use, but not in a way we need to encode — CoW pays natively yet has
 * paid at least once in WETH, and counting both is what caught it.
 */
export const getTreasuryFees = async ({
  service,
  chainId,
  treasury,
  senders,
  startTimestamp,
  endTimestamp,
  firstBlock,
}: TreasuryFeesParams): Promise<Fees[]> => {
  const baseUrl = getUnchainedBaseUrl(chainId)
  const senderSet = new Set([...senders].map(sender => sender.toLowerCase()))
  const treasuryAddress = treasury.toLowerCase()

  const [fromBlock, toBlock] = await Promise.all([
    getBlockByTimestamp(chainId, startTimestamp),
    getBlockByTimestamp(chainId, endTimestamp),
  ])

  if (fromBlock === null || toBlock === null) {
    throw new Error(`Failed to resolve ${chainId} block range for timestamps ${startTimestamp}-${endTimestamp}`)
  }

  const effectiveFromBlock = firstBlock === undefined ? fromBlock : Math.max(fromBlock, firstBlock)
  if (effectiveFromBlock > toBlock) return []

  const fees: Fees[] = []
  let cursor: string | undefined

  do {
    const { data } = await withRetry(`${service}/unchained`, () =>
      axios.get<UnchainedTxHistoryResponse>(`${baseUrl}/api/v1/account/${treasury}/txs`, {
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

      fees.push(...extractTreasuryFees(tx, { service, chainId, treasury: treasuryAddress, senders: senderSet }))
    }

    cursor = data.cursor
  } while (cursor)

  return fees
}

type ExtractParams = {
  service: Service
  chainId: string
  treasury: string
  senders: ReadonlySet<string>
}

/**
 * Turn one tx's transfers into fee rows, summed per asset.
 *
 * A tx can pay the treasury more than once — the same asset in several transfers,
 * or several assets at once — so amounts are summed per asset. That keeps one row
 * per (tx, asset), which is what downstream USD enrichment and fee counts expect.
 */
const extractTreasuryFees = (
  tx: Pick<UnchainedTx, 'txid' | 'timestamp' | 'internalTxs' | 'tokenTransfers'>,
  { service, chainId, treasury, senders }: ExtractParams
): Fees[] => {
  const amountByAssetId = new Map<string, bigint>()

  const add = (assetId: string, value: string) => {
    amountByAssetId.set(assetId, (amountByAssetId.get(assetId) ?? 0n) + BigInt(value))
  }

  const isFeeFromSender = (transfer: { from: string; to: string }) =>
    transfer.to.toLowerCase() === treasury && senders.has(transfer.from.toLowerCase())

  // Native fees arrive as internal txs, ERC20 fees as token transfers
  for (const itx of tx.internalTxs ?? []) {
    if (isFeeFromSender(itx)) add(buildAssetId(chainId), itx.value)
  }

  for (const transfer of tx.tokenTransfers ?? []) {
    if (isFeeFromSender(transfer)) add(buildAssetId(chainId, transfer.contract), transfer.value)
  }

  return [...amountByAssetId]
    .filter(([, amount]) => amount > 0n)
    .map(([assetId, amount]) => ({
      chainId,
      assetId,
      service,
      txHash: tx.txid,
      timestamp: tx.timestamp,
      amount: amount.toString(),
    }))
}
