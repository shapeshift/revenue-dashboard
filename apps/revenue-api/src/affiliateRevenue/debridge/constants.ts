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

/**
 * deBridge pays our affiliate cut on the SELL chain.
 *
 * shapeshift/web's DebridgeSwapper sends `affiliateFeePercent` +
 * `affiliateFeeRecipient` (the sell chain's DAO treasury, only on treasury
 * chains). The fee arrives in the sell token, native or ERC20, from one of two
 * contracts:
 *   - same-chain swaps: DeBridgeRouter transfers it during the swap
 *   - cross-chain DLN orders: DlnSource transfers it when a solver unlocks the
 *     filled order, typically hours after the swap
 *
 * deBridge's stats API can't attribute these: orders only filter by
 * referralCode (web sends none) and same-chain swaps have no list endpoint.
 *
 * DlnSource sends native fees with a 2300 gas stipend, which our Safe
 * treasuries can't always accept; those stay in DlnSource until claimed via
 * withdrawUnclaimedAffiliateFees (0.0006 ETH on ethereum as of 2026-10-20).
 *
 * KNOWN GAP — Monad, HyperEVM, Plasma, MegaETH, Robinhood and BOB are deBridge
 * treasury chains with no unchained host.
 */
export const DEBRIDGE_FEE_SENDERS = [
  '0x663dc15d3c1ac63ff12e45ab68fea3f0a883c251', // DeBridgeRouter (same-chain)
  '0xef4fb24ad0916217251f553c0596f8edc630eb66', // DlnSource (cross-chain)
]

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
