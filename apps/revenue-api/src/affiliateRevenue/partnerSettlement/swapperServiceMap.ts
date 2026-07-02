import type { Service } from '../../types'

// Raw @shapeshiftoss/swapper SwapperName -> dashboard Service id.
// Swappers with no dashboard provider are intentionally absent (=> null).
const SWAPPER_TO_SERVICE: Record<string, Service> = {
  AVNU: 'avnu',
  Bebop: 'bebop',
  ButterSwap: 'butterswap',
  Chainflip: 'chainflip',
  'CoW Swap': 'cowswap',
  MAYAChain: 'mayachain',
  'NEAR Intents': 'nearintents',
  Portals: 'portals',
  Relay: 'relay',
  THORChain: 'thorchain',
  '0x': 'zrx',
}

// NOTE for implementer: keys verified against the installed `@shapeshiftoss/swapper` package's `SwapperName` enum (`node_modules/@shapeshiftoss/swapper/dist/cjs/types.js`). `bobgateway` has no swapper counterpart (on-chain tracker) and is intentionally excluded.

export const mapSwapperNameToService = (swapperName: string): Service | null =>
  SWAPPER_TO_SERVICE[swapperName] ?? null
