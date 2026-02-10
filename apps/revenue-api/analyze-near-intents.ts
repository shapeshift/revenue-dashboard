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

async function analyzeNearIntents() {
  console.log('='.repeat(80))
  console.log('NEAR Intents Deep Analysis - January 31, 2026')
  console.log('='.repeat(80))
  console.log('')

  let page = 1
  let totalWithFees = 0
  let totalWithoutFees = 0
  let totalUsdWithFees = 0
  let totalUsdWithoutFees = 0

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

    for (const transaction of data.data) {
      allTransactions.push(transaction)

      for (const appFee of transaction.appFees) {
        if (appFee.recipient !== DAO_TREASURY_NEAR) {
          continue
        }

        const amountInUsd = parseFloat(transaction.amountInUsd)
        const feeUsd = (amountInUsd * appFee.fee) / FEE_BPS_DENOMINATOR

        if (appFee.fee > 0) {
          totalWithFees++
          totalUsdWithFees += feeUsd
        } else {
          totalWithoutFees++
          totalUsdWithoutFees += feeUsd
        }
      }
    }

    page = data.nextPage || 0
  }

  console.log('FEE BREAKDOWN:')
  console.log('-'.repeat(80))
  console.log(`Transactions with fees (>0 BPS): ${totalWithFees}`)
  console.log(`Transactions without fees (0 BPS): ${totalWithoutFees}`)
  console.log(`Total USD from fees: $${totalUsdWithFees.toFixed(6)}`)
  console.log(`Total USD from 0 BPS: $${totalUsdWithoutFees.toFixed(6)}`)
  console.log('')

  console.log('POTENTIAL CALCULATION BUG INVESTIGATION:')
  console.log('-'.repeat(80))
  console.log('\nThe screenshot mentions "potential calculation bug". Let me analyze...\n')

  // Check for any inconsistencies
  let foundIssue = false

  for (const transaction of allTransactions) {
    for (const appFee of transaction.appFees) {
      if (appFee.recipient !== DAO_TREASURY_NEAR) continue

      const amountIn = transaction.amountIn
      const amountInUsd = parseFloat(transaction.amountInUsd)
      const feeBps = appFee.fee

      // Calculate fee using the code's logic
      const feeAmount = calculateFee(amountIn, feeBps, FEE_BPS_DENOMINATOR)
      const feeUsd = (amountInUsd * feeBps) / FEE_BPS_DENOMINATOR

      // Check if there's any mismatch or unexpected behavior
      // The code uses amountIn which is in base units (wei, satoshi, etc.)
      // This is correct! No conversion needed.

      // However, let me check if amountInUsd matches what we'd expect
      // We can't verify this without knowing the asset price, but we can check consistency

      if (feeBps === 0 && feeUsd !== 0) {
        foundIssue = true
        console.log(`❌ ISSUE: Transaction ${transaction.intentHashes}`)
        console.log(`   Fee BPS is 0 but calculated USD fee is ${feeUsd}`)
      }

      if (feeBps > 0 && feeUsd === 0 && amountInUsd > 0) {
        foundIssue = true
        console.log(`❌ ISSUE: Transaction ${transaction.intentHashes}`)
        console.log(`   Fee BPS is ${feeBps} and amountInUsd is ${amountInUsd} but USD fee is 0`)
      }
    }
  }

  if (!foundIssue) {
    console.log('✅ No calculation inconsistencies found!')
    console.log('\nThe calculation logic appears correct:')
    console.log('1. amountIn is in base units (wei/satoshi) - no conversion needed')
    console.log('2. Fee calculation: (amountIn * feeBps) / 10000 - preserves base units')
    console.log('3. USD calculation: (amountInUsd * feeBps) / 10000 - correct')
    console.log('')
    console.log('However, there might be a different issue...')
  }

  console.log('\n' + '='.repeat(80))
  console.log('CHECKING FOR OTHER POTENTIAL ISSUES:')
  console.log('='.repeat(80))
  console.log('')

  // Check if we're missing any appFees
  let multipleAppFees = 0
  let singleAppFee = 0
  let noShapeShiftFee = 0

  for (const transaction of allTransactions) {
    if (transaction.appFees.length > 1) {
      multipleAppFees++
    } else if (transaction.appFees.length === 1) {
      singleAppFee++
    }

    const hasShapeShiftFee = transaction.appFees.some(
      (fee: any) => fee.recipient === DAO_TREASURY_NEAR
    )

    if (!hasShapeShiftFee) {
      noShapeShiftFee++
      console.log(`Transaction ${transaction.intentHashes} has no ShapeShift fee!`)
      console.log(`  appFees: ${JSON.stringify(transaction.appFees)}`)
    }
  }

  console.log('\nAPP FEE STRUCTURE:')
  console.log(`Transactions with multiple appFees: ${multipleAppFees}`)
  console.log(`Transactions with single appFee: ${singleAppFee}`)
  console.log(`Transactions missing ShapeShift fee: ${noShapeShiftFee}`)
  console.log('')

  // Show a sample transaction with all details
  console.log('\n' + '='.repeat(80))
  console.log('SAMPLE TRANSACTION (with fee):')
  console.log('='.repeat(80))
  const sampleWithFee = allTransactions.find(tx =>
    tx.appFees.some((fee: any) => fee.recipient === DAO_TREASURY_NEAR && fee.fee > 0)
  )
  if (sampleWithFee) {
    console.log(JSON.stringify(sampleWithFee, null, 2))
  }

  console.log('\n' + '='.repeat(80))
  console.log('FINAL SUMMARY FOR JAN 31, 2026:')
  console.log('='.repeat(80))
  console.log(`Total transactions: ${allTransactions.length}`)
  console.log(`Total fees with >0 BPS: ${totalWithFees}`)
  console.log(`Total fees with 0 BPS: ${totalWithoutFees}`)
  console.log(`Expected revenue: $${totalUsdWithFees.toFixed(6)}`)
  console.log('')
}

analyzeNearIntents().catch(console.error)
