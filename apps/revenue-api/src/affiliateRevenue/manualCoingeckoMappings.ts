// Manual CoinGecko ID mappings for assets that don't have automatic mappings
// Use this for tokens that are 1:1 pegged to other assets or need manual price overrides

export const MANUAL_COINGECKO_MAPPINGS: Record<string, string> = {
  // Near
  'near:mainnet/slip44:397': 'near',
  'near:mainnet/nep141:wrap.near': 'near',

  // Expanse
  'eip155:2/slip44:60': 'marcopolo',

  // MAP Protocol
  'eip155:22776/slip44:60': 'marcopolo',
  'eip155:22776/erc20:0x33daba9618a75a7aff103e53afe530fbacf4a3dd': 'mapped-usdt',

  // Starknet Native USDC (Circle official) - 1:1 with USDC
  'starknet:SN_MAIN/token:0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb': 'usd-coin',

  // Starknet Bridged USDC (USDC.e via StarkGate) - 1:1 with USDC
  'starknet:SN_MAIN/token:0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8': 'usd-coin',
}
