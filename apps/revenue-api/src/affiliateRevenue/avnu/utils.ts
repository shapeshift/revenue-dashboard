import { createRpcCaller } from '../utils/rpcCall'

import { AVNU_EXCHANGE, SHAPESHIFT_TREASURY, STARKNET_CHAIN_ID, STARKNET_RPC_URL } from './constants'
import type { StarknetEvent } from './types'

export const rpcCall = createRpcCaller(STARKNET_RPC_URL, 30000)

export const parseU256Amount = (low: string, high: string): string => {
  const lowBN = BigInt(low)
  const highBN = BigInt(high)
  const amount = lowBN + (highBN << 128n)
  return amount.toString()
}

export const normalizeStarknetAddress = (address: string): string => {
  // Starknet addresses are 32 bytes (64 hex chars) but RPC may return them without leading zeros
  // Normalize to lowercase and pad to 66 chars (0x + 64 hex)
  const cleaned = address.toLowerCase().replace('0x', '')
  return '0x' + cleaned.padStart(64, '0')
}

export const buildAssetId = (tokenAddress: string): string => {
  const normalized = normalizeStarknetAddress(tokenAddress)
  return `${STARKNET_CHAIN_ID}/token:${normalized}`
}

export const isAvnuTransfer = (event: StarknetEvent): boolean => {
  // keys[0] = Transfer selector (checked by query)
  // keys[1] = from (should be AVNU Exchange)
  // keys[2] = to (should be ShapeShift Treasury)
  // Constants are pre-normalized, only need to normalize event keys
  return (
    event.keys.length >= 3 &&
    normalizeStarknetAddress(event.keys[1]) === AVNU_EXCHANGE &&
    normalizeStarknetAddress(event.keys[2]) === SHAPESHIFT_TREASURY
  )
}
