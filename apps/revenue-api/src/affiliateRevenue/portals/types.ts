export type ChainConfig = {
  chainId: string
  network: string
  router: string
  treasury: string
  rpcUrl: string
}

export type PortalEventData = {
  txHash: string
  timestamp: number
  inputToken: string
  inputAmount: string
  outputToken: string
  outputAmount: string
}

export type TokenTransfer = {
  token: string
  amount: string
}

export type DecodedPortalEvent = {
  inputToken: string
  inputAmount: string
  outputToken: string
  outputAmount: string
}
