export const SHAPESHIFT_JUPITER_REFERRAL_KEY = 'Ajgmo453yGmcHDPoJBrMUj3GFwLVL7HaaZGNLkB8vREG'
export const JUPITER_AFFILIATE_CONTRACT = 'REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3'
export const JUPITER_PROJECT_ACCOUNT = '45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp'
export const SHAPESHIFT_SOLANA_RPC = 'https://api.solana.shapeshift.com/api/v1/jsonrpc'

export interface TrackedToken {
  mint: string
  chainId: string
  assetId: string
  symbol: string
}

export const TRACKED_TOKENS: TrackedToken[] = [
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
  },
  {
    mint: 'So11111111111111111111111111111111111111112',
    chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
    symbol: 'SOL',
  },
]
