import type { AppFee, AppFees, CurrencyObject, Route } from './types'

const toBigInt = (value: string | undefined): bigint | undefined => {
  try {
    return value === undefined ? undefined : BigInt(value)
  } catch {
    return undefined
  }
}

// The fee is bps of whichever leg it was taken from, so the leg whose amount it matches most closely names its currency
export const inferFeeCurrency = (route: Route | null | undefined, fee: AppFee): CurrencyObject | undefined => {
  const feeAmount = toBigInt(fee.amount)
  const bps = toBigInt(fee.bps)
  if (feeAmount === undefined || bps === undefined) return undefined
  const legs = [
    route?.origin?.inputCurrency,
    route?.origin?.outputCurrency,
    route?.destination?.inputCurrency,
    route?.destination?.outputCurrency,
  ]

  let best: { currency: CurrencyObject; diff: bigint; expected: bigint } | undefined
  for (const leg of legs) {
    const legAmount = toBigInt(leg?.amount)
    if (!leg || legAmount === undefined) continue
    const expected = (legAmount * bps) / 10000n
    if (expected === 0n) continue
    const diff = expected > feeAmount ? expected - feeAmount : feeAmount - expected
    if (diff * 100n > expected) continue
    if (!best || diff * best.expected < best.diff * expected) best = { currency: leg.currency, diff, expected }
  }

  return best?.currency
}

// An inferred currency only labels the token; USD must come from Relay, so a wrong guess can't change revenue
export const resolveFeeCurrency = (
  appFees: AppFees,
  route: Route | null | undefined,
  fees: AppFee[]
): CurrencyObject | undefined => {
  if (appFees.currency) return appFees.currency
  if (fees.length === 0 || !fees.every(fee => Number(fee.amountUsd) > 0)) return undefined
  return inferFeeCurrency(route, fees[0])
}
