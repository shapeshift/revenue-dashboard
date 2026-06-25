import { bn, bnOrZero } from '../../lib/bignumber'

// Converts amount to string, handling cases where 0x API returns it as a number
export const safeAmountToString = (amount: string | number | undefined): string => {
  if (amount === undefined || amount === null) return ''
  return typeof amount === 'string' ? amount : String(amount)
}

export const decimalToBaseUnit = (decimalAmount: string, decimals: number): string => {
  const amount = bn(decimalAmount.trim())
  const multiplier = bn(10).pow(decimals)
  const baseUnitAmount = amount.times(multiplier)

  return baseUnitAmount.toFixed(0)
}

export const calculateFee = (amount: string, feeBps: number, bpsDenominator: number): string => {
  const amountBN = bn(amount)
  const fee = amountBN.times(feeBps).div(bpsDenominator)

  return fee.toFixed(0)
}

export const baseUnitToTokenAmount = (amount: string, decimals: number): string => {
  const amountBN = bnOrZero(amount)
  const divisor = bn(10).pow(decimals)

  return amountBN.div(divisor).toFixed(decimals)
}
