import type { Service } from '../../types'

// Raw @shapeshiftoss/swapper SwapperName -> dashboard Service id.
// Swappers with no dashboard provider are intentionally absent (=> null).
const SWAPPER_TO_SERVICE: Record<string, Service> = {
  Avnu: 'avnu',
  Bebop: 'bebop',
  ButterSwap: 'butterswap',
  Chainflip: 'chainflip',
  'CoW Swap': 'cowswap',
  Mayachain: 'mayachain',
  NearIntents: 'nearintents',
  Portals: 'portals',
  Relay: 'relay',
  THORChain: 'thorchain',
  '0x': 'zrx',
}

// NOTE for implementer: confirm the exact `SwapperName` string values against `@shapeshiftoss/swapper` in the swap DB (`select distinct "swapperName" from swaps`) before merging; adjust keys to match. `bobgateway` has no swapper counterpart (on-chain tracker) and is intentionally excluded.

export const mapSwapperNameToService = (swapperName: string): Service | null =>
  SWAPPER_TO_SERVICE[swapperName] ?? null
