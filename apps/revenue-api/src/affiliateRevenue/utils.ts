import BigNumber from 'bignumber.js'

import { bn, bnOrZero } from '../lib/bignumber'

import { SLIP44 } from './constants'

// All EVM chains use slip44:60 (ETHEREUM) for asset database compatibility
export const getSlip44ForChain = (chainId: string): number => {
  if (!chainId.startsWith('eip155:')) {
    throw new Error(`Not an EVM chain: ${chainId}`)
  }

  return SLIP44.ETHEREUM
}

// Converts amount to string, handling cases where 0x API returns it as a number
export const safeAmountToString = (amount: string | number | undefined): string => {
  if (amount === undefined || amount === null) return ''
  return typeof amount === 'string' ? amount : String(amount)
}

export const decimalToBaseUnit = (decimalAmount: string, decimals: number): string => {
  const amount = bn(decimalAmount.trim())
  const multiplier = bn(10).pow(decimals)
  const baseUnitAmount = amount.times(multiplier)

  return baseUnitAmount.toFixed(0, BigNumber.ROUND_DOWN)
}

export const calculateFee = (amount: string, feeBps: number, bpsDenominator: number): string => {
  const amountBN = bn(amount)
  const fee = amountBN.times(feeBps).div(bpsDenominator)

  return fee.toFixed(0, BigNumber.ROUND_DOWN)
}

export const baseUnitToTokenAmount = (amount: string, decimals: number): string => {
  const amountBN = bnOrZero(amount)
  const divisor = bn(10).pow(decimals)

  return amountBN.div(divisor).toFixed(18, BigNumber.ROUND_DOWN)
}
