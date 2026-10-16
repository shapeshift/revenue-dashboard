import {
  ARBITRUM_CHAIN_ID,
  AVALANCHE_CHAIN_ID,
  BASE_CHAIN_ID,
  BSC_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  GNOSIS_CHAIN_ID,
  HYPEREVM_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  PLASMA_CHAIN_ID,
  POLYGON_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
  UNICHAIN_CHAIN_ID,
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
  [ROBINHOOD_CHAIN_ID]: 'robinhood-mainnet',
  [BASE_CHAIN_ID]: 'base-mainnet',
  [PLASMA_CHAIN_ID]: 'plasma-mainnet',
  [ARBITRUM_CHAIN_ID]: 'arb-mainnet',
  [AVALANCHE_CHAIN_ID]: 'avax-mainnet',
}

// Networks where Alchemy refuses any eth_getLogs over this many blocks outright; the rest only cap the log count
const ALCHEMY_BLOCK_RANGE_CAPS: Record<string, number> = {
  'avax-mainnet': 10_000,
  'gnosis-mainnet': 10_000,
  'plasma-mainnet': 10_000,
  'unichain-mainnet': 10_000,
}

export const createAlchemyClient = (chainId: string, context: string) => {
  const apiKey = process.env.ALCHEMY_API_KEY
  if (!apiKey) throw new Error('ALCHEMY_API_KEY env var not set')

  const network = ALCHEMY_NETWORK_BY_CHAIN_ID[chainId]
  if (!network) throw new Error(`No Alchemy network for ${chainId}`)

  const rpcUrl = `https://${network}.g.alchemy.com/v2/${apiKey}`
  return createEvmLogClient(chainId, rpcUrl, context, ALCHEMY_BLOCK_RANGE_CAPS[network])
}
