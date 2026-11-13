import {
  ARBITRUM_CHAIN_ID,
  AVALANCHE_CHAIN_ID,
  BASE_CHAIN_ID,
  BSC_CHAIN_ID,
  ELYSIUM_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  GNOSIS_CHAIN_ID,
  HYPEREVM_CHAIN_ID,
  MEGAETH_CHAIN_ID,
  MONAD_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  PLASMA_CHAIN_ID,
  POLYGON_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
  UNICHAIN_CHAIN_ID,
  SEI_CHAIN_ID,
  INK_CHAIN_ID,
  MANTLE_CHAIN_ID,
  SONIC_CHAIN_ID,
  CELO_CHAIN_ID,
  BOB_CHAIN_ID,
} from '../constants'

import { createEvmLogClient } from './evmLogClient'

const ALCHEMY_NETWORK_BY_CHAIN_ID: Record<string, string> = {
  [ETHEREUM_CHAIN_ID]: 'eth-mainnet',
  [OPTIMISM_CHAIN_ID]: 'opt-mainnet',
  [BSC_CHAIN_ID]: 'bnb-mainnet',
  [GNOSIS_CHAIN_ID]: 'gnosis-mainnet',
  [UNICHAIN_CHAIN_ID]: 'unichain-mainnet',
  [POLYGON_CHAIN_ID]: 'polygon-mainnet',
  [HYPEREVM_CHAIN_ID]: 'hyperliquid-mainnet',
  [MONAD_CHAIN_ID]: 'monad-mainnet',
  [MEGAETH_CHAIN_ID]: 'megaeth-mainnet',
  [ROBINHOOD_CHAIN_ID]: 'robinhood-mainnet',
  [BASE_CHAIN_ID]: 'base-mainnet',
  [PLASMA_CHAIN_ID]: 'plasma-mainnet',
  [ARBITRUM_CHAIN_ID]: 'arb-mainnet',
  [AVALANCHE_CHAIN_ID]: 'avax-mainnet',
  [ELYSIUM_CHAIN_ID]: 'elysium-mainnet',
  [SEI_CHAIN_ID]: 'sei-mainnet',
  [INK_CHAIN_ID]: 'ink-mainnet',
  [MANTLE_CHAIN_ID]: 'mantle-mainnet',
  [SONIC_CHAIN_ID]: 'sonic-mainnet',
  [CELO_CHAIN_ID]: 'celo-mainnet',
  [BOB_CHAIN_ID]: 'bob-mainnet',
}

// Networks where Alchemy refuses any eth_getLogs over this many blocks outright; the rest only cap the log count
const ALCHEMY_BLOCK_RANGE_CAP = 10_000
const ALCHEMY_RANGE_CAPPED_NETWORKS = new Set([
  'avax-mainnet',
  'bob-mainnet',
  'celo-mainnet',
  'elysium-mainnet',
  'gnosis-mainnet',
  'ink-mainnet',
  'mantle-mainnet',
  'megaeth-mainnet',
  'plasma-mainnet',
  'sonic-mainnet',
  'unichain-mainnet',
])

export const createAlchemyClient = (chainId: string, context: string) => {
  const apiKey = process.env.ALCHEMY_API_KEY
  if (!apiKey) throw new Error('ALCHEMY_API_KEY env var not set')

  const network = ALCHEMY_NETWORK_BY_CHAIN_ID[chainId]
  if (!network) throw new Error(`No Alchemy network for ${chainId}`)

  const rpcUrl = `https://${network}.g.alchemy.com/v2/${apiKey}`
  return createEvmLogClient(
    chainId,
    rpcUrl,
    context,
    ALCHEMY_RANGE_CAPPED_NETWORKS.has(network) ? ALCHEMY_BLOCK_RANGE_CAP : undefined
  )
}
