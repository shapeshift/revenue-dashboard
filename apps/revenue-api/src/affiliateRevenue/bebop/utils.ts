import { SOLANA_CHAIN_ID } from '../constants'

import type { Trade } from './types'

// Bebop's own chain id for Solana, not an EVM chain id
const BEBOP_SOLANA_CHAIN_ID = 2

export const toChainId = (bebopChainId: number): string =>
  bebopChainId === BEBOP_SOLANA_CHAIN_ID ? SOLANA_CHAIN_ID : `eip155:${bebopChainId}`

// Fee fields come back as "0.0" strings when nothing was charged, and only settled trades earn a fee
// (matching the SUCCESS-only rule for partner netting)
export const isChargedTrade = (trade: Trade): boolean =>
  trade.status === 'Success' && Number(trade.partnerFeeBps) > 0 && Number(trade.partnerFeeNative) > 0

// The end of the next (older) page, or undefined once the window is exhausted
export const nextPageEnd = (nextAvailableTimestamp: string | undefined, cursor: bigint, start: bigint) => {
  if (nextAvailableTimestamp === undefined) return undefined
  const next = BigInt(nextAvailableTimestamp)
  if (next < start) return undefined
  if (next >= cursor) throw new Error(`[bebop] pagination cursor ${next} did not move back from ${cursor}`)
  return next
}
