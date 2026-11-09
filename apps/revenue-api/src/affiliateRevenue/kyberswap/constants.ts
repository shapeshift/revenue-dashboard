import type { Address } from 'viem'
import { parseAbiItem } from 'viem'

import {
  ARBITRUM_CHAIN_ID,
  AVALANCHE_CHAIN_ID,
  BASE_CHAIN_ID,
  BSC_CHAIN_ID,
  DAO_TREASURY_ARBITRUM,
  DAO_TREASURY_AVALANCHE,
  DAO_TREASURY_BASE,
  DAO_TREASURY_BSC,
  DAO_TREASURY_ELYSIUM,
  DAO_TREASURY_ETHEREUM,
  DAO_TREASURY_HYPEREVM,
  DAO_TREASURY_MEGAETH,
  DAO_TREASURY_MONAD,
  DAO_TREASURY_OPTIMISM,
  DAO_TREASURY_PLASMA,
  DAO_TREASURY_POLYGON,
  DAO_TREASURY_ROBINHOOD,
  DAO_TREASURY_UNICHAIN,
  ELYSIUM_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  HYPEREVM_CHAIN_ID,
  MEGAETH_CHAIN_ID,
  MONAD_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  PLASMA_CHAIN_ID,
  POLYGON_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
  UNICHAIN_CHAIN_ID,
} from '../constants'

// MetaAggregationRouterV2, same address on every chain: https://docs.kyberswap.com/developer-guide/aggregator-api/contracts
export const KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5'

export const KYBER_FIRST_FEE_TIMESTAMP = 1793754545

export const FEE_EVENT = parseAbiItem(
  'event Fee(address token, uint256 totalAmount, uint256 totalFee, address[] recipients, uint256[] amounts, bool isBps)'
)

export type KyberChain = {
  chainId: string
  network: string
  treasury: Address
}

export const KYBER_CHAINS: KyberChain[] = [
  { chainId: ETHEREUM_CHAIN_ID, network: 'ethereum', treasury: DAO_TREASURY_ETHEREUM },
  { chainId: OPTIMISM_CHAIN_ID, network: 'optimism', treasury: DAO_TREASURY_OPTIMISM },
  { chainId: BSC_CHAIN_ID, network: 'bsc', treasury: DAO_TREASURY_BSC },
  { chainId: UNICHAIN_CHAIN_ID, network: 'unichain', treasury: DAO_TREASURY_UNICHAIN },
  { chainId: POLYGON_CHAIN_ID, network: 'polygon', treasury: DAO_TREASURY_POLYGON },
  { chainId: MONAD_CHAIN_ID, network: 'monad', treasury: DAO_TREASURY_MONAD },
  { chainId: HYPEREVM_CHAIN_ID, network: 'hyperevm', treasury: DAO_TREASURY_HYPEREVM },
  { chainId: MEGAETH_CHAIN_ID, network: 'megaeth', treasury: DAO_TREASURY_MEGAETH },
  { chainId: ROBINHOOD_CHAIN_ID, network: 'robinhood', treasury: DAO_TREASURY_ROBINHOOD },
  { chainId: BASE_CHAIN_ID, network: 'base', treasury: DAO_TREASURY_BASE },
  { chainId: PLASMA_CHAIN_ID, network: 'plasma', treasury: DAO_TREASURY_PLASMA },
  { chainId: ARBITRUM_CHAIN_ID, network: 'arbitrum', treasury: DAO_TREASURY_ARBITRUM },
  { chainId: AVALANCHE_CHAIN_ID, network: 'avalanche', treasury: DAO_TREASURY_AVALANCHE },
  { chainId: ELYSIUM_CHAIN_ID, network: 'elysium', treasury: DAO_TREASURY_ELYSIUM },
]
