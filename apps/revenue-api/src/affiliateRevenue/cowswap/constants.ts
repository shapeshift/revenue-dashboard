import {
  ARBITRUM_CHAIN_ID,
  AVALANCHE_CHAIN_ID,
  BASE_CHAIN_ID,
  DAO_TREASURY_ARBITRUM,
  DAO_TREASURY_AVALANCHE,
  DAO_TREASURY_BASE,
  DAO_TREASURY_ETHEREUM,
  DAO_TREASURY_GNOSIS,
  DAO_TREASURY_POLYGON,
  ETHEREUM_CHAIN_ID,
  GNOSIS_CHAIN_ID,
  POLYGON_CHAIN_ID,
} from '../constants'

// CoW Protocol pays partner fees weekly as batched *native token* multisends from
// its payouts Safe(s): each tx unwraps wrapped-native (WETH/wxDAI/...) -> native,
// then disperses to solvers and partners. ShapeShift's cut lands at the per-chain
// DAO treasury as an internal transfer (recipient = the partnerFee.recipient
// encoded in each order's appData = the chain's treasury). See
// docs.cow.fi/governance/fees/partner-fee and the payout construction in
// cowprotocol/solver-rewards (partner transfers use token=None, i.e. native).
//
// CoW uses more than one payouts Safe across chains — treat these as a set. Both
// are confirmed CoW (they disperse to solvers and pay CoW's protocol-fee safe
// 0x22af3D38E50ddedeb7C47f36faB321eC3Bb72A76 in the same tx). Extend if CoW rolls
// out a new payouts Safe (symptom would be revenue silently dropping to zero).
export const COW_PAYOUT_SAFES = new Set<string>([
  '0xa03be496e67ec29bc62f01a428683d7f9c204930', // ethereum, base, avalanche
  '0x66331f0b9cb30d38779c786bda5a3d57d12fba50', // arbitrum, polygon
])

export const COW_CHAINS: { chainId: string; treasury: string }[] = [
  { chainId: ETHEREUM_CHAIN_ID, treasury: DAO_TREASURY_ETHEREUM },
  { chainId: ARBITRUM_CHAIN_ID, treasury: DAO_TREASURY_ARBITRUM },
  { chainId: BASE_CHAIN_ID, treasury: DAO_TREASURY_BASE },
  { chainId: POLYGON_CHAIN_ID, treasury: DAO_TREASURY_POLYGON },
  { chainId: AVALANCHE_CHAIN_ID, treasury: DAO_TREASURY_AVALANCHE },
  { chainId: GNOSIS_CHAIN_ID, treasury: DAO_TREASURY_GNOSIS },
]
