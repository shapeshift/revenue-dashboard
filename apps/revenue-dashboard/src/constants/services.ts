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
  debridge: 'deBridge',
  relay: 'Relay',
  symbiosis: 'Symbiosis',
  fynd: 'Fynd',
}

// Brand colors from each logo, or the site's accent where the logo is too dark for the dashboard; 0x and Bebop are black/white brands
export const SERVICE_COLORS: Record<string, string> = {
  across: '#6cf9d8',
  avnu: '#3761f6',
  bobgateway: '#f25c00',
  thorchain: '#00ccff',
  mayachain: '#21c49e',
  chainflip: '#fe519e',
  zrx: '#f4f4f5',
  bebop: '#a1a1aa',
  portals: '#6a19fe',
  cowswap: '#65d9ff',
  debridge: '#fbff3a',
  relay: '#c84aff',
  butterswap: '#fabd00',
  nearintents: '#00ec97',
  symbiosis: '#8bf934',
  fynd: '#ff4e2c',
}

export const getServiceLabel = (service: string) => SERVICE_LABELS[service.toLowerCase()] || service

export const getServiceColor = (service: string) => SERVICE_COLORS[service.toLowerCase()] || '#6b7280'

export const SERVICE_STACK_ORDER = [
  'thorchain',
  'zrx',
  'bebop',
  'mayachain',
  'avnu',
  'chainflip',
  'portals',
  'cowswap',
  'relay',
  'butterswap',
  'nearintents',
  'bobgateway',
  'across',
  'symbiosis',
  'fynd',
  'debridge',
]
