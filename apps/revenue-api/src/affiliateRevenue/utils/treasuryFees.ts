import axios from 'axios'

import type { Service } from '../../types'
import { withRetry } from '../../utils/retry'
import type { Fees } from '../types'

import { createAlchemyClient } from './alchemy'
import { buildAssetId } from './asset'
import type { EvmLogClient } from './evmLogClient'
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
  // A cross-chain swap the treasury made pays out in a tx it never touches; checked only on txs that pay a fee
  isOwnSwap?: (txid: string, client: EvmLogClient) => Promise<boolean>
}

// Fees are native or ERC20 transfers from a sender into the treasury (CoW pays native but has paid in WETH), minus its own swaps
export const getTreasuryFees = async ({
  service,
  chainId,
  treasury,
  senders,
  startTimestamp,
  endTimestamp,
  firstBlock,
  isOwnSwap,
}: TreasuryFeesParams): Promise<Fees[]> => {
  const baseUrl = getUnchainedBaseUrl(chainId)
  const senderSet = new Set([...senders].map(sender => sender.toLowerCase()))
  const treasuryAddress = treasury.toLowerCase()

  const client = createAlchemyClient(chainId, service)
  const [fromBlock, toBlock] = await Promise.all([
    client.resolveBlock(startTimestamp),
    client.resolveBlock(endTimestamp),
  ])

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

    const feesByTx = data.txs
      .filter(tx => tx.status === 1 && tx.timestamp >= startTimestamp && tx.timestamp <= endTimestamp)
      .map(tx => extractTreasuryFees(tx, { service, chainId, treasury: treasuryAddress, senders: senderSet }))
      .filter(txFees => txFees.length > 0)

    const ownSwaps = isOwnSwap ? await Promise.all(feesByTx.map(txFees => isOwnSwap(txFees[0].txHash, client))) : []
    feesByTx.forEach((txFees, i) => {
      if (!ownSwaps[i]) fees.push(...txFees)
    })

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

// Swap output can only reach the treasury in the same tx if the treasury paid for the swap there
const isTreasurySpend = (
  tx: Pick<UnchainedTx, 'from' | 'internalTxs' | 'tokenTransfers'>,
  treasury: string
): boolean => {
  if (tx.from.toLowerCase() === treasury) return true
  // Zero-value transfers are address-poisoning spam, not spends
  if ((tx.tokenTransfers ?? []).some(t => t.from.toLowerCase() === treasury && BigInt(t.value) > 0n)) return true

  // Net, since some Safes forward each native receipt to their singleton, which unchained lists as an equal outflow
  let nativeNet = 0n
  for (const itx of tx.internalTxs ?? []) {
    if (itx.to.toLowerCase() === treasury) nativeNet += BigInt(itx.value)
    if (itx.from.toLowerCase() === treasury) nativeNet -= BigInt(itx.value)
  }

  return nativeNet < 0n
}

// One row per (tx, asset): a tx can pay the treasury several times, so amounts are summed
export const extractTreasuryFees = (
  tx: Pick<UnchainedTx, 'txid' | 'timestamp' | 'from' | 'internalTxs' | 'tokenTransfers'>,
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

  if (amountByAssetId.size === 0 || isTreasurySpend(tx, treasury)) return []

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
