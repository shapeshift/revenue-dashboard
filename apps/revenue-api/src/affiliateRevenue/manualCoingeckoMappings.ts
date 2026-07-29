// Manual CoinGecko ID mappings for assets that don't have automatic mappings
// Use this for tokens that are 1:1 pegged to other assets or need manual price overrides

export const MANUAL_COINGECKO_MAPPINGS: Record<string, string> = {
  // Ethereum
  'eip155:1/erc20:0x196c20da81fbc324ecdf55501e95ce9f0bd84d14': 'polkadot',

  // Aptos
  'aptos:1/slip44:637': 'aptos',

  // Near
  'near:mainnet/slip44:397': 'near',
  'near:mainnet/nep141:wrap.near': 'near',

  // Pudgy Penguins (PENGU) bridged from Solana via Omni Deposit
  'near:mainnet/nep141:sol-0xaad74c68eecfc9f8c5bdcea614f6167048c795ef.omdep.near': 'pudgy-penguins',

  // Expanse
  'eip155:2/slip44:60': 'marcopolo',

  // MAP Protocol — bridge-mapped tokens ButterSwap charges affiliate fees in. Only mapped USDT is
  // listed on CoinGecko; the rest price off the 1:1 asset they're pegged to.
  'eip155:22776/slip44:60': 'marcopolo',
  'eip155:22776/erc20:0x33daba9618a75a7aff103e53afe530fbacf4a3dd': 'mapped-usdt',
  'eip155:22776/erc20:0x9f722b2cb30093f766221fd0d37964949ed66918': 'usd-coin',
  'eip155:22776/erc20:0x05ab928d446d8ce6761e368c8e7be03c3168a9ec': 'ethereum',
  'eip155:22776/erc20:0xb877e3562a660c7861117c2f1361a26abaf19beb': 'bitcoin',

  // Starknet Native USDC (Circle official) - 1:1 with USDC
  'starknet:SN_MAIN/token:0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb': 'usd-coin',

  // Starknet Bridged USDC (USDC.e via StarkGate) - 1:1 with USDC
  'starknet:SN_MAIN/token:0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8': 'usd-coin',
}
