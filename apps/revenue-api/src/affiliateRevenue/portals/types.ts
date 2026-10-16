export type ChainConfig = {
  chainId: string
  network: string
  treasury: string
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
