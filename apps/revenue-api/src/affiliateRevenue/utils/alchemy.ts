const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY

if (!ALCHEMY_API_KEY) throw new Error('ALCHEMY_API_KEY env var not set')

export const getAlchemyRpcUrl = (network: string): string => `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
