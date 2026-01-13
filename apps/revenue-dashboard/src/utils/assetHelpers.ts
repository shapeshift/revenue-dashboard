export const formatTokenAmountDisplay = (tokenAmount: string): string => {
  const value = parseFloat(tokenAmount)

  // Show 2 decimals for amounts >= 1, otherwise 4
  const fractionDigits = value >= 1 ? 2 : 4

  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}
