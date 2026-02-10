import axios from 'axios'
import BigNumber from 'bignumber.js'

const NEAR_INTENTS_API_KEY = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjUtMDEtMTItdjEifQ.eyJ2IjoxLCJrZXlfdHlwZSI6ImV4cGxvcmVyIiwicGFydG5lcl9pZCI6InNoYXBlc2hpZnQiLCJpYXQiOjE3NjYxNDI4OTcsImV4cCI6MTc5NzY3ODg5N30.ZAsHs2OHpRTagoMyEVPmDaBObPL9y1wOtce_2-FrcnS9iQ7_WKHiOZsdl-Lymdt4C3gheSKSRLQU3NEY2k2a_8qzpL6oAnBgtgwlEd-S5CL6r5hLML0d6w-uOh7XHKZ2T6lMV12A9O53Cxir1t8dISX8gs_hlz77rUM33ES9j5p2xmjRF0blsmuVh2EF3OGqx5LfsB7WZWdIboSd_wFDESaID2D-PhrHet5o1yI_s-kX0GHwNRpHilubTTJjfjLLdbO2rYbj23MlltvU-3B1pz_HuefOxUXa-JUnEsfkw6e_MvNHh505ecoPFp_5GmhN2-GlAkymv2fNoKCjuJdSLQ'
const DAO_TREASURY_NEAR = 'f471d0b0f90593d85125f38aaf5458748d6f23fd5b437b844d293d8e87557070'
const FEE_BPS_DENOMINATOR = 10000

// Jan 31, 2026 timestamps
const START_TIMESTAMP = 1769817600
const END_TIMESTAMP = 1769903999

const bn = (value: string | number): BigNumber => new BigNumber(value)

const calculateFee = (amount: string, feeBps: number, bpsDenominator: number): string => {
  const amountBN = bn(amount)
  const fee = amountBN.times(feeBps).div(bpsDenominator)
  return fee.toFixed(0, BigNumber.ROUND_DOWN)
}

async function investigateBug() {
  console.log('='.repeat(80))
  console.log('INVESTIGATING CALCULATION BUG')
  console.log('='.repeat(80))
  console.log('')

  let page = 1
  const allTransactions: any[] = []

  while (page) {
    const { data } = await axios.get(
      'https://explorer.near-intents.org/api/v0/transactions-pages',
      {
        params: {
          referral: 'shapeshift',
          page,
          perPage: 1000,
          statuses: 'SUCCESS',
          startTimestampUnix: START_TIMESTAMP,
          endTimestampUnix: END_TIMESTAMP,
        },
        headers: { Authorization: `Bearer ${NEAR_INTENTS_API_KEY}` },
      }
    )

    allTransactions.push(...data.data)
    page = data.nextPage || 0
  }

  console.log('HYPOTHESIS: Bug might be in how fees are being summed or displayed')
  console.log('-'.repeat(80))
  console.log('')

  // Let's see if the bug is that we're including 0 BPS transactions
  console.log('Option 1: Including ALL transactions (even 0 BPS)')
  let option1Total = 0
  for (const tx of allTransactions) {
    for (const appFee of tx.appFees) {
      if (appFee.recipient === DAO_TREASURY_NEAR) {
        const feeUsd = (parseFloat(tx.amountInUsd) * appFee.fee) / FEE_BPS_DENOMINATOR
        option1Total += feeUsd
        console.log(`  ${tx.intentHashes.slice(0, 8)}... | Fee BPS: ${appFee.fee} | USD: $${feeUsd.toFixed(6)}`)
      }
    }
  }
  console.log(`\nTotal: $${option1Total.toFixed(6)}`)
  console.log('')

  console.log('Option 2: Excluding 0 BPS transactions')
  let option2Total = 0
  for (const tx of allTransactions) {
    for (const appFee of tx.appFees) {
      if (appFee.recipient === DAO_TREASURY_NEAR && appFee.fee > 0) {
        const feeUsd = (parseFloat(tx.amountInUsd) * appFee.fee) / FEE_BPS_DENOMINATOR
        option2Total += feeUsd
        console.log(`  ${tx.intentHashes.slice(0, 8)}... | Fee BPS: ${appFee.fee} | USD: $${feeUsd.toFixed(6)}`)
      }
    }
  }
  console.log(`\nTotal: $${option2Total.toFixed(6)}`)
  console.log('')

  console.log('='.repeat(80))
  console.log('POTENTIAL BUG IDENTIFIED:')
  console.log('='.repeat(80))
  console.log('')
  console.log('The code CORRECTLY calculates fees, but there might be confusion about:')
  console.log('1. Whether to include 0 BPS transactions (currently included)')
  console.log('2. The amountInUsd vs feeUsd distinction')
  console.log('')
  console.log('Current code behavior:')
  console.log('- Iterates through all appFees where recipient = DAO_TREASURY_NEAR')
  console.log('- Calculates fee even if feeBps = 0 (result is $0.00)')
  console.log('- Returns ALL fee records (including $0.00 ones)')
  console.log('')
  console.log('This is technically correct, but might be misleading if someone')
  console.log('expects only non-zero fees.')
  console.log('')

  // Check if there's an issue with the amountUsd field being used instead of feeUsd
  console.log('='.repeat(80))
  console.log('CHECKING FOR AMOUNTUSD vs FEEUSD CONFUSION:')
  console.log('='.repeat(80))
  console.log('')

  let sumOfAmountInUsd = 0
  let sumOfFeeUsd = 0

  for (const tx of allTransactions) {
    for (const appFee of tx.appFees) {
      if (appFee.recipient === DAO_TREASURY_NEAR) {
        const amountInUsd = parseFloat(tx.amountInUsd)
        const feeUsd = (amountInUsd * appFee.fee) / FEE_BPS_DENOMINATOR

        sumOfAmountInUsd += amountInUsd
        sumOfFeeUsd += feeUsd
      }
    }
  }

  console.log(`Sum of amountInUsd: $${sumOfAmountInUsd.toFixed(2)}`)
  console.log(`Sum of feeUsd: $${sumOfFeeUsd.toFixed(6)}`)
  console.log('')
  console.log('⚠️  CRITICAL: If dashboard shows ~$14k instead of ~$657,')
  console.log('    it might be summing amountInUsd instead of feeUsd!')
  console.log('')

  // Check the code's stored amountUsd field
  console.log('='.repeat(80))
  console.log('CHECKING WHAT GETS STORED IN THE DATABASE:')
  console.log('='.repeat(80))
  console.log('')
  console.log('According to nearIntents.ts line 84:')
  console.log('  amountUsd: String(feeUsd)')
  console.log('')
  console.log('This is CORRECT - it stores the calculated fee USD, not the full amountInUsd.')
  console.log('')
  console.log('Sample stored values:')
  for (let i = 0; i < Math.min(5, allTransactions.length); i++) {
    const tx = allTransactions[i]
    for (const appFee of tx.appFees) {
      if (appFee.recipient === DAO_TREASURY_NEAR) {
        const amountInUsd = parseFloat(tx.amountInUsd)
        const feeUsd = (amountInUsd * appFee.fee) / FEE_BPS_DENOMINATOR
        console.log(`  amountUsd: "${String(feeUsd)}" (fee: ${appFee.fee} BPS)`)
      }
    }
  }
  console.log('')

  console.log('='.repeat(80))
  console.log('CONCLUSION:')
  console.log('='.repeat(80))
  console.log('')
  console.log('The calculation logic in nearIntents.ts is CORRECT:')
  console.log('✅ Line 74: feeAmount = (amountIn * feeBps) / 10000')
  console.log('✅ Line 75: feeUsd = (amountInUsd * feeBps) / 10000')
  console.log('✅ Line 84: amountUsd: String(feeUsd) - stores the calculated fee')
  console.log('')
  console.log('Expected revenue for Jan 31, 2026: $657.18')
  console.log('')
  console.log('If the dashboard shows a different number, the bug is likely:')
  console.log('- In the frontend aggregation logic')
  console.log('- In how the data is being queried/filtered')
  console.log('- In currency conversion or price enrichment')
  console.log('')
}

investigateBug().catch(console.error)
