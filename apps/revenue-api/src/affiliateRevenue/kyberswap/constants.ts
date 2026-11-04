import type { Address } from 'viem'
import { parseAbiItem } from 'viem'

import {
  DAO_TREASURY_HYPEREVM,
  DAO_TREASURY_MEGAETH,
  DAO_TREASURY_MONAD,
  DAO_TREASURY_PLASMA,
  HYPEREVM_CHAIN_ID,
  MEGAETH_CHAIN_ID,
  MONAD_CHAIN_ID,
  PLASMA_CHAIN_ID,
} from '../constants'

// MetaAggregationRouterV2, same address on every chain: https://docs.kyberswap.com/developer-guide/aggregator-api/contracts
export const KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5'

// First fee the router paid a treasury (Monad 0xfa87b33b…5c9b); nothing precedes it on any chain
export const KYBER_FIRST_FEE_TIMESTAMP = 1793754545

// One per swap, paid to the recipients in the same tx; with isBps the amounts are bps of totalAmount, and nothing is indexed, so we filter
export const FEE_EVENT = parseAbiItem(
  'event Fee(address token, uint256 totalAmount, uint256 totalFee, address[] recipients, uint256[] amounts, bool isBps)'
)

export type KyberChain = {
  chainId: string
  network: string
  treasury: Address
}

// Chains web routes through KyberSwap; the fee receiver is the chain's DAO treasury
export const KYBER_CHAINS: KyberChain[] = [
  { chainId: MONAD_CHAIN_ID, network: 'monad', treasury: DAO_TREASURY_MONAD },
  { chainId: HYPEREVM_CHAIN_ID, network: 'hyperevm', treasury: DAO_TREASURY_HYPEREVM },
  { chainId: MEGAETH_CHAIN_ID, network: 'megaeth', treasury: DAO_TREASURY_MEGAETH },
  { chainId: PLASMA_CHAIN_ID, network: 'plasma', treasury: DAO_TREASURY_PLASMA },
]
