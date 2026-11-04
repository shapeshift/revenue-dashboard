import { BITCOIN_CHAIN_ID, SLIP44, SOLANA_CHAIN_ID, TRON_CHAIN_ID } from '../constants'

import type { CurrencyObject } from './types'

export const RELAY_API_KEY = process.env.RELAY_API_KEY

if (!RELAY_API_KEY) throw new Error('RELAY_API_KEY env var not set')

export const RELAY_API_URL = 'https://api.relay.link'
export const SHAPESHIFT_REFERRER = 'shapeshift'

export const NON_EVM_CHAINS: Record<number, { chainId: string; slip44: number }> = {
  792703809: { chainId: SOLANA_CHAIN_ID, slip44: SLIP44.SOLANA },
  8253038: { chainId: BITCOIN_CHAIN_ID, slip44: SLIP44.BITCOIN },
  728126428: { chainId: TRON_CHAIN_ID, slip44: SLIP44.TRON },
  9286185: { chainId: 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z', slip44: SLIP44.SOLANA },
  9286186: { chainId: 'solana:soon', slip44: SLIP44.SOLANA },
}

const WBTC_ETHEREUM = { chainId: 1, address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' }
const WBTC_ARBITRUM = { chainId: 42161, address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f' }
const WBTC_BSC = { chainId: 56, address: '0x0555e30da8f98308edb960aa94c0db47230d2b9c' }
const WBTC_POLYGON = { chainId: 137, address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6' }
const ETH_BLAST = { chainId: 81457, address: '0x0000000000000000000000000000000000000000' }
const OMI_BASE = { chainId: 8453, address: '0x3792dbdd07e87413247df995e692806aa13d3299' }

// Relay omits appFees.currency on these older requests; each currency was matched from the fee and the route's legs
export const MISSING_FEE_CURRENCIES: Record<string, Pick<CurrencyObject, 'chainId' | 'address'>> = {
  '0xed00f6500d88577daefe867ebd9df4fd9f406df928c31f3fd099df100af65dcd': WBTC_BSC,
  '0xcc57440f7eb254f5cd28524e68fc736bc7461f128aabda8b69c3d28f7fb7293a': WBTC_BSC,
  '0x699e7727c319324716db031fd9f000edab67b03a9d9efb7caa6c2dcc6f7a2cef': WBTC_ETHEREUM,
  '0x2c53b8d8fc479b1b5cf003f17ade3a27c36f3e22dc988eb6344a03a3bd7ed434': WBTC_ETHEREUM,
  '0xab55953e90044ac0f575de047e449dbbd86e841c8cbd05b10d944a9688361e3c': OMI_BASE,
  '0xd62d6241d1eabe222c01f1f4efcc0463c2f54f923619b39c22ea942c86bcc8ef': OMI_BASE,
  '0xcdd27a13f298613c7eb1bf144cbafa2bd0efb229ea501c2e64e09cb9a8e128eb': WBTC_ETHEREUM,
  '0x88d1f09edffe1dfb4126570a7abde8392e103a3fe2a1b479e1f28b2ef5851187': WBTC_ETHEREUM,
  '0x53aab4dc09a37c5ed259c52992c018e59b3daea715d515983ca27dc55b85e8bb': WBTC_ARBITRUM,
  '0xf55e0dae041a740fd4bb66e56b71ad382ecbd66f46fbf818c272d5a2ff386065': WBTC_ETHEREUM,
  '0x9ee86da3c546dc26f3b3978dffec78e7c6906938a220597c93fe3990581da367': ETH_BLAST,
  '0x05fab002cfe0bd28739e7e028ed22605032ac2ba1b1fc2717f742350b746d5a0': ETH_BLAST,
  '0x880fefcac1b7a5a2c59dd01dd67ef56031fda84d927bcfb60ca5b0109536322c': ETH_BLAST,
  '0x84418069345f9d88b691356e080eaa5b06841289fb230b0e716318bddfcfd73b': WBTC_ETHEREUM,
  '0x3ce13c9a220de99d74811f739fda8700b566dc8da80c06d389fdc5f737b74b56': WBTC_POLYGON,
  '0x10579b60409472b0a19ef9c23b9bc0a259eb4126203e9ac58639ad614ab95d0f': WBTC_ETHEREUM,
  '0xb4b3dec8816f0d08c0ee30e8592a8b3950306e667c2d3876da28723fbd4a40e7': WBTC_ARBITRUM,
  '0x34030f07cbb5dde25e1b619e92974b4a93935daa0fe6ed1fd9424d21d67783a0': WBTC_ARBITRUM,
}
