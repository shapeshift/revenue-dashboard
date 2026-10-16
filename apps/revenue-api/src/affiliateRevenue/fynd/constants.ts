import { parseAbiItem } from 'viem'

import {
  ARBITRUM_CHAIN_ID,
  BASE_CHAIN_ID,
  BSC_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  POLYGON_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
  UNICHAIN_CHAIN_ID,
} from '../constants'

// Our fee receiver, credited by the router per swap; fees sit in its vault until swept, so the credit is what we count
export const FYND_FEE_RECEIVER = '0x4617085877F19102E8308259e2a79bea3f8bE4Ef'

// First fee credited to the receiver (Base 0xca23f7a3…f5d0); nothing precedes it on any chain
export const FYND_FIRST_FEE_TIMESTAMP = 1792001041

// One per swap, listing each recipient's fee (Fynd's and ours) in the buy token; recipient isn't indexed, so we filter
export const FEES_TAKEN_EVENT = parseAbiItem([
  'event FeesTaken(address indexed token, FeeRecipient[] fees)',
  'struct FeeRecipient { address recipient; uint256 feeAmount; }',
])

export type FyndChain = {
  chainId: string
  network: string
  router: string
}

// TychoRouterV3 per chain: https://docs.propellerheads.xyz/tycho/for-solvers/execution/contract-addresses
export const FYND_CHAINS: FyndChain[] = [
  {
    chainId: ETHEREUM_CHAIN_ID,
    network: 'ethereum',
    router: '0x1644D2477f809cc2C71bCCFd6Dc9497E3F83210d',
  },
  {
    chainId: BASE_CHAIN_ID,
    network: 'base',
    router: '0xAbA5B53b03eAfaD1C5fc8BD5Fc765fC85Bb3de67',
  },
  {
    chainId: ARBITRUM_CHAIN_ID,
    network: 'arbitrum',
    router: '0x924F147c50eA59f5180a26031A8b65B2aA1e81Cd',
  },
  {
    chainId: BSC_CHAIN_ID,
    network: 'bsc',
    router: '0x7f3D12BBaFb8955E51B3ab9588b34c8ad95BDA4e',
  },
  {
    chainId: POLYGON_CHAIN_ID,
    network: 'polygon',
    router: '0xbd4e6011F03355C2A377Fd9Af939322A7d0A1bC1',
  },
  {
    chainId: UNICHAIN_CHAIN_ID,
    network: 'unichain',
    router: '0xCba5574597Ad00EA250Fd106DAB4Fc7461949635',
  },
  {
    chainId: ROBINHOOD_CHAIN_ID,
    network: 'robinhood',
    router: '0x09215a470bD585E59EB3F4B612fBD2678131fF9e',
  },
]
