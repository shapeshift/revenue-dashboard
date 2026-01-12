export const SERVICE_LABELS: Record<string, string> = {
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
}

export const getServiceLabel = (service: string) => SERVICE_LABELS[service.toLowerCase()] || service
