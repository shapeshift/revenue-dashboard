import {
  ARBITRUM_CHAIN_ID,
  AVALANCHE_CHAIN_ID,
  BASE_CHAIN_ID,
  BSC_CHAIN_ID,
  DAO_TREASURY_ARBITRUM,
  DAO_TREASURY_AVALANCHE,
  DAO_TREASURY_BASE,
  DAO_TREASURY_BSC,
  DAO_TREASURY_ETHEREUM,
  DAO_TREASURY_GNOSIS,
  DAO_TREASURY_HYPEREVM,
  DAO_TREASURY_OPTIMISM,
  DAO_TREASURY_PLASMA,
  DAO_TREASURY_POLYGON,
  ETHEREUM_CHAIN_ID,
  GNOSIS_CHAIN_ID,
  HYPEREVM_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  PLASMA_CHAIN_ID,
  POLYGON_CHAIN_ID,
} from '../constants'

import type { ChainConfig } from './types'

// Matched from any emitter: the partner topic plus a real fee transfer identify our swaps, so a router redeploy is still seen
export const PORTAL_EVENT_SIGNATURE = '0x5915121ae705c6baa1bd6698f437ff30eb4b7dbd20e1f7d83c2f1a8be09a1f03'
export const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId: ETHEREUM_CHAIN_ID,
    network: 'ethereum',
    treasury: DAO_TREASURY_ETHEREUM,
  },
  {
    chainId: ARBITRUM_CHAIN_ID,
    network: 'arbitrum',
    treasury: DAO_TREASURY_ARBITRUM,
  },
  {
    chainId: OPTIMISM_CHAIN_ID,
    network: 'optimism',
    treasury: DAO_TREASURY_OPTIMISM,
  },
  {
    chainId: BASE_CHAIN_ID,
    network: 'base',
    treasury: DAO_TREASURY_BASE,
  },
  {
    chainId: POLYGON_CHAIN_ID,
    network: 'polygon',
    treasury: DAO_TREASURY_POLYGON,
  },
  {
    chainId: GNOSIS_CHAIN_ID,
    network: 'gnosis',
    treasury: DAO_TREASURY_GNOSIS,
  },
  {
    chainId: BSC_CHAIN_ID,
    network: 'bsc',
    treasury: DAO_TREASURY_BSC,
  },
  {
    chainId: AVALANCHE_CHAIN_ID,
    network: 'avalanche',
    treasury: DAO_TREASURY_AVALANCHE,
  },
  {
    chainId: HYPEREVM_CHAIN_ID,
    network: 'hyperevm',
    treasury: DAO_TREASURY_HYPEREVM,
  },
  {
    chainId: PLASMA_CHAIN_ID,
    network: 'plasma',
    treasury: DAO_TREASURY_PLASMA,
  },
]
