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
  DAO_TREASURY_OPTIMISM,
  DAO_TREASURY_POLYGON,
  ETHEREUM_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  POLYGON_CHAIN_ID,
} from '../constants'

/**
 * Across pays our affiliate cut as an "app fee" on the DESTINATION chain.
 *
 * shapeshift/web's AcrossSwapper (`utils/getTrade.ts`) sends `appFee` +
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
 * KNOWN GAP — Monad (eip155:143) and HyperEVM (eip155:999) also qualify, but
 * neither has an unchained host, and their combined lifetime Across revenue is
 * ~$0.17: Monad has had exactly one payout (6.997 MON, 2026-05-21) and HyperEVM
 * one (0.0071 USDC, 2026-06-02). Not worth a second data-source backend today.
 * If either starts producing real volume:
 *   - HyperEVM: keyless Blockscout at https://www.hyperscan.com/api/v2 —
 *     `/addresses/<treasury>/token-transfers` already surfaces the handler payout.
 *   - Monad: needs Etherscan V2 (API key, free-tier coverage of chain 143
 *     unconfirmed) or Envio HyperSync. Do NOT use Moralis — its Monad index
 *     silently omits native internal transfers, which is how app fees arrive
 *     there, so it reports zero rather than failing.
 * Handlers, for whenever that happens: Monad 0xeC41F75c686e376Ab2a4F18bde263ab5822c4511,
 * HyperEVM 0x5E7840E06fAcCb6d1c3b5F5E0d1d3d07F2829bba.
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
  // Across + treasury + unchained all exist here, but shapeshift/web's
  // chainIdToAcrossChainId doesn't map Avalanche yet, so this is zero today.
  // Kept wired up so revenue is captured the moment the swapper adds it.
  [AVALANCHE_CHAIN_ID]: [
    '0x9610954AcDCA5FF7905f051A040ce33fe613c60e',
    '0x64A14B477d16F1E9D490B00218ada0c142C885dd', // PermissionedMulticallHandler
  ],
}

export const ACROSS_CHAINS: { chainId: string; treasury: string }[] = [
  { chainId: ETHEREUM_CHAIN_ID, treasury: DAO_TREASURY_ETHEREUM },
  { chainId: OPTIMISM_CHAIN_ID, treasury: DAO_TREASURY_OPTIMISM },
  { chainId: BSC_CHAIN_ID, treasury: DAO_TREASURY_BSC },
  { chainId: POLYGON_CHAIN_ID, treasury: DAO_TREASURY_POLYGON },
  { chainId: BASE_CHAIN_ID, treasury: DAO_TREASURY_BASE },
  { chainId: ARBITRUM_CHAIN_ID, treasury: DAO_TREASURY_ARBITRUM },
  { chainId: AVALANCHE_CHAIN_ID, treasury: DAO_TREASURY_AVALANCHE },
]
