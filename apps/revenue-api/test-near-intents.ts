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

async function testNearIntentsAPI() {
  console.log('='.repeat(80))
  console.log('NEAR Intents API Test for January 31, 2026')
  console.log('='.repeat(80))
  console.log(`Start timestamp: ${START_TIMESTAMP} (${new Date(START_TIMESTAMP * 1000).toISOString()})`)
  console.log(`End timestamp: ${END_TIMESTAMP} (${new Date(END_TIMESTAMP * 1000).toISOString()})`)
  console.log('')

  let page = 1
  let totalTransactions = 0
  let totalFeesCollected = 0
  let totalUsdFees = 0

  const feeDetails: Array<{
    txHash: string
    amountIn: string
    amountInUsd: string
    feeBps: number
    feeAmount: string
    feeUsd: number
    calculatedFeeAmount: string
    calculatedFeeUsd: number
  }> = []

  while (page) {
    console.log(`\nFetching page ${page}...`)

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

    console.log(`  Received ${data.data.length} transactions`)
    console.log(`  Total pages: ${data.totalPages}`)
    console.log(`  Next page: ${data.nextPage || 'none'}`)

    for (const transaction of data.data) {
      totalTransactions++

      for (const appFee of transaction.appFees) {
        if (appFee.recipient !== DAO_TREASURY_NEAR) {
          continue
        }

        totalFeesCollected++

        const amountInStr = transaction.amountIn
        const amountInUsd = parseFloat(transaction.amountInUsd)

        // This is what the code DOES (using amountIn which is in base units)
        const feeAmount = calculateFee(amountInStr, appFee.fee, FEE_BPS_DENOMINATOR)
        const feeUsd = (amountInUsd * appFee.fee) / FEE_BPS_DENOMINATOR

        // Store for analysis
        feeDetails.push({
          txHash: transaction.intentHashes,
          amountIn: amountInStr,
          amountInUsd: transaction.amountInUsd,
          feeBps: appFee.fee,
          feeAmount,
          feeUsd,
          calculatedFeeAmount: feeAmount,
          calculatedFeeUsd: feeUsd,
        })

        totalUsdFees += feeUsd
      }
    }

    page = data.nextPage || 0
  }

  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total transactions: ${totalTransactions}`)
  console.log(`Total fees collected: ${totalFeesCollected}`)
  console.log(`Total USD value: $${totalUsdFees.toFixed(6)}`)
  console.log('')

  if (feeDetails.length > 0) {
    console.log('\nFee Details (first 10):')
    console.log('-'.repeat(80))
    for (let i = 0; i < Math.min(10, feeDetails.length); i++) {
      const fee = feeDetails[i]
      console.log(`\nTransaction ${i + 1}: ${fee.txHash}`)
      console.log(`  Amount In: ${fee.amountIn} (base units)`)
      console.log(`  Amount In USD: $${fee.amountInUsd}`)
      console.log(`  Fee BPS: ${fee.feeBps} (${(fee.feeBps / 100).toFixed(2)}%)`)
      console.log(`  Calculated Fee Amount: ${fee.calculatedFeeAmount} (base units)`)
      console.log(`  Calculated Fee USD: $${fee.calculatedFeeUsd.toFixed(6)}`)
    }

    console.log('\n' + '='.repeat(80))
    console.log('CALCULATION ANALYSIS')
    console.log('='.repeat(80))
    console.log('\nHow the code calculates fees:')
    console.log('1. Uses amountIn (already in base units like wei/satoshi)')
    console.log('2. Calculates fee: feeAmount = (amountIn * feeBps) / 10000')
    console.log('3. Calculates USD: feeUsd = (amountInUsd * feeBps) / 10000')
    console.log('\nThis appears CORRECT because:')
    console.log('- amountIn is already in base units (no conversion needed)')
    console.log('- The fee calculation preserves the unit (base units)')
    console.log('- The USD calculation uses the USD value directly')

    console.log('\n' + '='.repeat(80))
    console.log('EXPECTED REVENUE FOR JAN 31, 2026')
    console.log('='.repeat(80))
    console.log(`Total USD Revenue: $${totalUsdFees.toFixed(6)}`)
    console.log('')
  }
}

testNearIntentsAPI().catch(console.error)
