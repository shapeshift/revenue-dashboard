import {
  ARBITRUM_CHAIN_ID,
  AVALANCHE_CHAIN_ID,
  BASE_CHAIN_ID,
  BSC_CHAIN_ID,
  DAO_TREASURY_ARBITRUM,
  DAO_TREASURY_AVALANCHE,
  DAO_TREASURY_BASE,
  DAO_TREASURY_BSC,
  DAO_TREASURY_ETHEREUM,
  DAO_TREASURY_GNOSIS,
  DAO_TREASURY_OPTIMISM,
  DAO_TREASURY_POLYGON,
  ETHEREUM_CHAIN_ID,
  GNOSIS_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  POLYGON_CHAIN_ID,
} from '../constants'

// Fees go to the sell chain's treasury; deBridge's stats API can't list them (referralCode filter only, no same-chain list)
// DlnSource sends native fees with a 2300-gas stipend; ones a Safe rejects sit uncounted in unclaimedAffiliateETHFees until withdrawn
export const DEBRIDGE_FEE_SENDERS = [
  '0x663dc15d3c1ac63ff12e45ab68fea3f0a883c251', // DeBridgeRouter: same-chain, paid in the buy token during the swap
  '0xef4fb24ad0916217251f553c0596f8edc630eb66', // DlnSource: cross-chain, paid in the order's input token on unlock
]

// Monad, HyperEVM, Plasma, MegaETH, Robinhood and BOB are untracked (no unchained host)
export const DEBRIDGE_CHAINS: { chainId: string; treasury: string }[] = [
  { chainId: ETHEREUM_CHAIN_ID, treasury: DAO_TREASURY_ETHEREUM },
  { chainId: OPTIMISM_CHAIN_ID, treasury: DAO_TREASURY_OPTIMISM },
  { chainId: BSC_CHAIN_ID, treasury: DAO_TREASURY_BSC },
  { chainId: GNOSIS_CHAIN_ID, treasury: DAO_TREASURY_GNOSIS },
  { chainId: POLYGON_CHAIN_ID, treasury: DAO_TREASURY_POLYGON },
  { chainId: BASE_CHAIN_ID, treasury: DAO_TREASURY_BASE },
  { chainId: ARBITRUM_CHAIN_ID, treasury: DAO_TREASURY_ARBITRUM },
  { chainId: AVALANCHE_CHAIN_ID, treasury: DAO_TREASURY_AVALANCHE },
]
