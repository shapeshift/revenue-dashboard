export const SERVICE_LABELS: Record<string, string> = {
  across: 'Across',
  avnu: 'AVNU',
  bobgateway: 'BOB Gateway',
  nearintents: 'Near Intents',
  butterswap: 'Butter Swap',
  thorchain: 'THORChain',
  mayachain: 'Maya Protocol',
  chainflip: 'Chainflip',
  zrx: '0x',
  bebop: 'Bebop',
  portals: 'Portals',
  cowswap: 'CoW Swap',
  relay: 'Relay',
  jupiter: 'Jupiter',
}

export const SERVICE_COLORS: Record<string, string> = {
  across: '#3b82f6',
  avnu: '#8b5cf6',
  bobgateway: '#ef4444',
  thorchain: '#0095FF',
  mayachain: '#6366f1',
  chainflip: '#22c55e',
  zrx: '#f59e0b',
  bebop: '#ec4899',
  portals: '#14b8a6',
  cowswap: '#8b5cf6',
  relay: '#f97316',
  butterswap: '#84cc16',
  nearintents: '#06b6d4',
  jupiter: '#a855f7',
}

export const getServiceLabel = (service: string) => SERVICE_LABELS[service.toLowerCase()] || service

export const getServiceColor = (service: string) => SERVICE_COLORS[service.toLowerCase()] || '#6b7280'

export const SERVICE_STACK_ORDER = [
  'thorchain',
  'zrx',
  'bebop',
  'mayachain',
  'avnu',
  'jupiter',
  'chainflip',
  'portals',
  'cowswap',
  'relay',
  'butterswap',
  'nearintents',
  'bobgateway',
  'across',
]
