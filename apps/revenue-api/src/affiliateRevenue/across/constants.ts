import {
  ARBITRUM_CHAIN_ID,
  BASE_CHAIN_ID,
  BSC_CHAIN_ID,
  DAO_TREASURY_ARBITRUM,
  DAO_TREASURY_BASE,
  DAO_TREASURY_BSC,
  DAO_TREASURY_ETHEREUM,
  DAO_TREASURY_OPTIMISM,
  DAO_TREASURY_HYPEREVM,
  DAO_TREASURY_INK,
  DAO_TREASURY_MEGAETH,
  DAO_TREASURY_MONAD,
  DAO_TREASURY_PLASMA,
  DAO_TREASURY_POLYGON,
  DAO_TREASURY_ROBINHOOD,
  DAO_TREASURY_UNICHAIN,
  ETHEREUM_CHAIN_ID,
  HYPEREVM_CHAIN_ID,
  INK_CHAIN_ID,
  MEGAETH_CHAIN_ID,
  MONAD_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  PLASMA_CHAIN_ID,
  POLYGON_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
  UNICHAIN_CHAIN_ID,
} from '../constants'

/**
 * Across pays our affiliate cut as an "app fee" on the DESTINATION chain.
 *
 * shapeshift/web's AcrossSwapper (`utils/getAcrossTradeContext.ts`) sends `appFee` +
 * `appFeeRecipient` to Across' Swap API, where appFeeRecipient is the DAO
 * treasury on the *buy* asset's chain. Across encodes that into the deposit's
 * message, and on fill its MulticallHandler — the deposit `recipient` — splits
 * the output token: the user's share to the user, the app fee to our treasury.
 *
 * So revenue is "transfers into the per-chain treasury sent by that chain's
 * Across handler". Fees land in the destination-chain output asset, which is an
 * ERC20 or the native token depending on the trade, so we look at both.
 *
 * Two constraints from the swapper narrow which chains can ever pay us:
 *   - app fees are skipped entirely for Solana routes
 *   - app fees are skipped unless the buy chain is a treasury chain
 * The set below is therefore (Across chains) ∩ (treasury chains) ∩ (EVM).
 *
 * Chains without an unchained host (Monad, HyperEVM, Ink, Plasma, Unichain, MegaETH, Robinhood) read the treasury
 * through Alchemy instead. Robinhood's handler isn't in deployed-addresses.json yet; it's the deposit recipient the
 * Swap API returns for Robinhood routes with an appFee.
 */

/**
 * Across MulticallHandler addresses, keyed by chain.
 *
 * NOT a single global constant: most chains reuse the CREATE2 deployment
 * 0x0F7Ae2..., but newer chains do not (Monad and HyperEVM each have their own,
 * as do Avalanche, Linea, zkSync, Lens, MegaETH, Tempo). Assuming one address
 * would silently drop revenue on those chains.
 *
 * Source of truth: `@across-protocol/contracts` →
 * `dist/broadcast/deployed-addresses.json` (chains.<id>.contracts.*MulticallHandler*).
 * Cross-checked against the live Swap API: quoting each chain with an appFee and
 * decoding the returned depositV3 calldata yields exactly these addresses as the
 * deposit recipient. Re-run `scripts/verifyAcrossHandlers.ts` after an Across
 * upgrade — the symptom of a stale entry is revenue silently going to zero on a
 * chain.
 *
 * Each chain lists every handler variant it has deployed, not just the plain
 * MulticallHandler: CCTP/OFT routes fill through a PermissionedMulticallHandler
 * instead, and those pay the app fee too.
 */
export const ACROSS_HANDLERS_BY_CHAIN_ID: Record<string, readonly string[]> = {
  [ETHEREUM_CHAIN_ID]: [
    '0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E',
    '0x64a43393866DBA0044879979fAa7AD3d000622e9', // PermissionedMulticallHandler
    '0xDd52f8134f85f3979fbA24387Ce0CEC05937259E', // Permissioned CCTP USDC
  ],
  [OPTIMISM_CHAIN_ID]: ['0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E'],
  [BSC_CHAIN_ID]: ['0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E'],
  [POLYGON_CHAIN_ID]: ['0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E'],
  [BASE_CHAIN_ID]: [
    '0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E',
    '0xB6CAAfD8Ecf18385fFc7c020327E111a1D40A2D4', // Permissioned CCTP USDC
  ],
  [ARBITRUM_CHAIN_ID]: ['0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E'],
  [MONAD_CHAIN_ID]: ['0xeC41F75c686e376Ab2a4F18bde263ab5822c4511'],
  [HYPEREVM_CHAIN_ID]: [
    '0x5E7840E06fAcCb6d1c3b5F5E0d1d3d07F2829bba',
    '0xeaa13e675Fb95821B99D34B9c94c3D60fecAdd4A', // Permissioned OFT USDT
    '0xD7B719ed2b02Bfa0247600EDd6bd8Fb3957e95c8', // Permissioned CCTP USDC
    '0x9EE4300b6af03392bE493fa769DE33bb07242bfb', // Permissioned CCTP USDH
  ],
  [INK_CHAIN_ID]: ['0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E'],
  [PLASMA_CHAIN_ID]: ['0x5E7840E06fAcCb6d1c3b5F5E0d1d3d07F2829bba'],
  [UNICHAIN_CHAIN_ID]: ['0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E'],
  [MEGAETH_CHAIN_ID]: ['0xFfc1285082deAB9bf0ECA5699e4930bb310aFbE4'],
  [ROBINHOOD_CHAIN_ID]: ['0xa8aD2e87E2043711d8BeC77e8BC3E2683C0ab6BD'],
}

export const ACROSS_CHAINS: { chainId: string; treasury: string }[] = [
  { chainId: ETHEREUM_CHAIN_ID, treasury: DAO_TREASURY_ETHEREUM },
  { chainId: OPTIMISM_CHAIN_ID, treasury: DAO_TREASURY_OPTIMISM },
  { chainId: BSC_CHAIN_ID, treasury: DAO_TREASURY_BSC },
  { chainId: POLYGON_CHAIN_ID, treasury: DAO_TREASURY_POLYGON },
  { chainId: BASE_CHAIN_ID, treasury: DAO_TREASURY_BASE },
  { chainId: ARBITRUM_CHAIN_ID, treasury: DAO_TREASURY_ARBITRUM },
  { chainId: MONAD_CHAIN_ID, treasury: DAO_TREASURY_MONAD },
  { chainId: HYPEREVM_CHAIN_ID, treasury: DAO_TREASURY_HYPEREVM },
  { chainId: INK_CHAIN_ID, treasury: DAO_TREASURY_INK },
  { chainId: PLASMA_CHAIN_ID, treasury: DAO_TREASURY_PLASMA },
  { chainId: UNICHAIN_CHAIN_ID, treasury: DAO_TREASURY_UNICHAIN },
  { chainId: MEGAETH_CHAIN_ID, treasury: DAO_TREASURY_MEGAETH },
  { chainId: ROBINHOOD_CHAIN_ID, treasury: DAO_TREASURY_ROBINHOOD },
]
