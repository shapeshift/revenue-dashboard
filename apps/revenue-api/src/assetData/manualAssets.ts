import type { StaticAsset } from './types'

// Manual asset definitions for tokens not in the main database
export const MANUAL_ASSETS: Record<string, StaticAsset> = {
  // MAP Protocol USDT (ButterSwap revenue token)
  // Bridged USDT on MAP Protocol - verified on-chain: 18 decimals (unusual for USDT but correct)
  'eip155:22776/erc20:0x33daba9618a75a7aff103e53afe530fbacf4a3dd': {
    assetId: 'eip155:22776/erc20:0x33daba9618a75a7aff103e53afe530fbacf4a3dd',
    chainId: 'eip155:22776',
    symbol: 'USDT',
    name: 'Map Bridged USDT',
    precision: 18,
    color: '#26A17B',
    icon: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
  },

  // Avalanche C-Chain token - decimal count unverified, using 18 as default
  // TODO: Verify actual decimal count if this token generates significant revenue
  'eip155:43114/erc20:0x230c4ad11510360ad0db564a889c33559a959487': {
    assetId: 'eip155:43114/erc20:0x230c4ad11510360ad0db564a889c33559a959487',
    chainId: 'eip155:43114',
    symbol: 'UNKNOWN',
    name: 'Unknown Avalanche Token',
    precision: 18,
    color: '#CCCCCC',
    icon: '',
  },

  // Near Intents revenue tokens
  'tron:0x2b6653dc/slip44:195': {
    assetId: 'tron:0x2b6653dc/slip44:195',
    chainId: 'tron:0x2b6653dc',
    symbol: 'TRX',
    name: 'Tron',
    precision: 6,
    color: '#FF060A',
    icon: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png',
  },

  'bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133': {
    assetId: 'bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133',
    chainId: 'bip122:00040fe8ec8471911baa1db1266ea15d',
    symbol: 'ZEC',
    name: 'Zcash',
    precision: 8,
    color: '#F4B728',
    icon: 'https://assets.coingecko.com/coins/images/486/large/circle-zcash-color.png',
  },

  'near:mainnet/nep141:usdt.tether-token': {
    assetId: 'near:mainnet/nep141:usdt.tether-token',
    chainId: 'near:mainnet',
    symbol: 'USDT',
    name: 'Tether USD (Near)',
    precision: 6,
    color: '#26A17B',
    icon: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
  },

  'near:mainnet/slip44:397': {
    assetId: 'near:mainnet/slip44:397',
    chainId: 'near:mainnet',
    symbol: 'NEAR',
    name: 'NEAR Protocol',
    precision: 24,
    color: '#000000',
    icon: 'https://assets.coingecko.com/coins/images/10365/large/near.jpg',
  },

  'near:mainnet/nep141:wrap': {
    assetId: 'near:mainnet/nep141:wrap',
    chainId: 'near:mainnet',
    symbol: 'wNEAR',
    name: 'Wrapped NEAR',
    precision: 24,
    color: '#000000',
    icon: 'https://assets.coingecko.com/coins/images/10365/large/near.jpg',
  },

  'starknet:sn_main/slip44:9004': {
    assetId: 'starknet:sn_main/slip44:9004',
    chainId: 'starknet:sn_main',
    symbol: 'STRK',
    name: 'Starknet',
    precision: 18,
    color: '#EC796B',
    icon: 'https://assets.coingecko.com/coins/images/26433/large/starknet.png',
  },

  // Starknet Native USDC (Circle official, launched Dec 2025)
  // Official address: https://www.circle.com/blog/now-available-native-usdc-cctp-on-starknet
  'starknet:sn_main/token:0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb': {
    assetId: 'starknet:sn_main/token:0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb',
    chainId: 'starknet:sn_main',
    symbol: 'USDC',
    name: 'USD Coin (Native)',
    precision: 6,
    color: '#2775CA',
    icon: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
  },

  // Starknet Bridged USDC (USDC.e via StarkGate)
  'starknet:sn_main/token:0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8': {
    assetId: 'starknet:sn_main/token:0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    chainId: 'starknet:sn_main',
    symbol: 'USDC.e',
    name: 'USD Coin (Bridged)',
    precision: 6,
    color: '#2775CA',
    icon: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
  },

  // Starknet USDT
  'starknet:sn_main/token:0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8': {
    assetId: 'starknet:sn_main/token:0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
    chainId: 'starknet:sn_main',
    symbol: 'USDT',
    name: 'Tether USD (Starknet)',
    precision: 6,
    color: '#26A17B',
    icon: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
  },

  // Starknet ETH (bridged)
  'starknet:sn_main/token:0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7': {
    assetId: 'starknet:sn_main/token:0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    chainId: 'starknet:sn_main',
    symbol: 'ETH',
    name: 'Ethereum (Starknet)',
    precision: 18,
    color: '#627EEA',
    icon: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  },

  // Starknet DAI
  'starknet:sn_main/token:0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3': {
    assetId: 'starknet:sn_main/token:0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3',
    chainId: 'starknet:sn_main',
    symbol: 'DAI',
    name: 'Dai Stablecoin (Starknet)',
    precision: 18,
    color: '#F4B731',
    icon: 'https://assets.coingecko.com/coins/images/9956/large/dai-multi-collateral-mcd.png',
  },

  'sui:35834a8a/slip44:784': {
    assetId: 'sui:35834a8a/slip44:784',
    chainId: 'sui:35834a8a',
    symbol: 'SUI',
    name: 'Sui',
    precision: 9,
    color: '#6FBCF0',
    icon: 'https://assets.coingecko.com/coins/images/26375/large/sui_asset.jpeg',
  },

  // Monad mainnet tokens (chain 143)
  'eip155:143/erc20:0x754704bc059f8c67012fed69bc8a327a5aafb603': {
    assetId: 'eip155:143/erc20:0x754704bc059f8c67012fed69bc8a327a5aafb603',
    chainId: 'eip155:143',
    symbol: 'USDC',
    name: 'USD Coin (Monad)',
    precision: 6,
    color: '#2775CA',
    icon: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
  },

  'eip155:143/slip44:60': {
    assetId: 'eip155:143/slip44:60',
    chainId: 'eip155:143',
    symbol: 'ETH',
    name: 'Ethereum (Monad)',
    precision: 18,
    color: '#627EEA',
    icon: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  },

  // Testnet tokens (low priority)
  'eip155:9745/slip44:60': {
    assetId: 'eip155:9745/slip44:60',
    chainId: 'eip155:9745',
    symbol: 'ETH',
    name: 'Ethereum (Monad Testnet)',
    precision: 18,
    color: '#627EEA',
    icon: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  },

  'eip155:9745/erc20:0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb': {
    assetId: 'eip155:9745/erc20:0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb',
    chainId: 'eip155:9745',
    symbol: 'USDC',
    name: 'USD Coin (Monad Testnet)',
    precision: 6,
    color: '#2775CA',
    icon: 'https://assets.coingecko.com/coins/images/6319/large/usdc.png',
  },

  'eip155:999/slip44:60': {
    assetId: 'eip155:999/slip44:60',
    chainId: 'eip155:999',
    symbol: 'ETH',
    name: 'Ethereum (Zora Sepolia)',
    precision: 18,
    color: '#627EEA',
    icon: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  },

  'eip155:747474/slip44:60': {
    assetId: 'eip155:747474/slip44:60',
    chainId: 'eip155:747474',
    symbol: 'FLOW',
    name: 'Flow (Testnet)',
    precision: 18,
    color: '#00EF8B',
    icon: 'https://assets.coingecko.com/coins/images/13446/large/flow.png',
  },
}
