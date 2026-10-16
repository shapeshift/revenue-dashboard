const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY

if (!ALCHEMY_API_KEY) throw new Error('ALCHEMY_API_KEY env var not set')

export const getAlchemyRpcUrl = (network: string): string => `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`

// Networks where Alchemy refuses any eth_getLogs over this many blocks outright; the rest only cap the log count
const ALCHEMY_BLOCK_RANGE_CAPS: Record<string, number> = {
  'avax-mainnet': 10_000,
  'gnosis-mainnet': 10_000,
  'plasma-mainnet': 10_000,
  'unichain-mainnet': 10_000,
}

export const getAlchemyBlockRangeCap = (network: string): number | undefined => ALCHEMY_BLOCK_RANGE_CAPS[network]
