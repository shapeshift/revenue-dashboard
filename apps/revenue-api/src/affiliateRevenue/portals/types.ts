export type ChainConfig = {
  chainId: string
  network: string
  treasury: string
  // Last timestamp web routed Portals here; later windows aren't scanned
  until?: number
}

export type PortalTx = {
  txHash: string
  blockNumber: number
  timestamp: number
}

export type TokenTransfer = {
  token: string
  amount: string
}
