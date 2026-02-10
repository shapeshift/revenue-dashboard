import axios from 'axios'
import BigNumber from 'bignumber.js'

const NEAR_INTENTS_API_KEY = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjIwMjUtMDEtMTItdjEifQ.eyJ2IjoxLCJrZXlfdHlwZSI6ImV4cGxvcmVyIiwicGFydG5lcl9pZCI6InNoYXBlc2hpZnQiLCJpYXQiOjE3NjYxNDI4OTcsImV4cCI6MTc5NzY3ODg5N30.ZAsHs2OHpRTagoMyEVPmDaBObPL9y1wOtce_2-FrcnS9iQ7_WKHiOZsdl-Lymdt4C3gheSKSRLQU3NEY2k2a_8qzpL6oAnBgtgwlEd-S5CL6r5hLML0d6w-uOh7XHKZ2T6lMV12A9O53Cxir1t8dISX8gs_hlz77rUM33ES9j5p2xmjRF0blsmuVh2EF3OGqx5LfsB7WZWdIboSd_wFDESaID2D-PhrHet5o1yI_s-kX0GHwNRpHilubTTJjfjLLdbO2rYbj23MlltvU-3B1pz_HuefOxUXa-JUnEsfkw6e_MvNHh505ecoPFp_5GmhN2-GlAkymv2fNoKCjuJdSLQ'
const DAO_TREASURY_NEAR = 'f471d0b0f90593d85125f38aaf5458748d6f23fd5b437b844d293d8e87557070'
const FEE_BPS_DENOMINATOR = 10000

const START_TIMESTAMP = 1769817600
const END_TIMESTAMP = 1769903999

const bn = (value: string | number): BigNumber => new BigNumber(value)

const calculateFee = (amount: string, feeBps: number, bpsDenominator: number): string => {
  const amountBN = bn(amount)
  const fee = amountBN.times(feeBps).div(bpsDenominator)
  return fee.toFixed(0, BigNumber.ROUND_DOWN)
}

// Simplified asset parser for demo
function parseAsset(asset: string): string {
  // Just extract enough to show the pattern
  if (asset.includes('eth-0xdac17f958d2ee523a2206206994597c13d831ec7')) {
    return 'USDT (Ethereum)'
  }
  if (asset.includes('usdt')) {
    return 'USDT'
  }
  if (asset.includes('usdc')) {
    return 'USDC'
  }
  if (asset.includes('eth') || asset.includes('11111111111111111111')) {
    return 'ETH/Native'
  }
  return asset
}

async function checkEnrichmentImpact() {
  console.log('='.repeat(80))
  console.log('ENRICHMENT IMPACT ANALYSIS')
  console.log('='.repeat(80))
  console.log('')

  let page = 1
  const allFees: any[] = []

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
      for (const appFee of transaction.appFees) {
        if (appFee.recipient !== DAO_TREASURY_NEAR) continue

        const amountInStr = transaction.amountIn
        const amountInUsd = parseFloat(transaction.amountInUsd)
        const feeAmount = calculateFee(amountInStr, appFee.fee, FEE_BPS_DENOMINATOR)
        const feeUsd = (amountInUsd * appFee.fee) / FEE_BPS_DENOMINATOR

        allFees.push({
          txHash: transaction.intentHashes,
          originAsset: transaction.originAsset,
          assetName: parseAsset(transaction.originAsset),
          amountIn: amountInStr,
          amountInUsd: transaction.amountInUsd,
          feeBps: appFee.fee,
          feeAmount: feeAmount,
          originalFeeUsd: String(feeUsd),
        })
      }
    }

    page = data.nextPage || 0
  }

  console.log('WHAT GETS STORED IN DATABASE (before enrichment):')
  console.log('-'.repeat(80))
  console.log('Fields stored per fee record:')
  console.log('  - amount: Fee amount in base units')
  console.log('  - amountUsd: Fee USD value (calculated from integration API)')
  console.log('  - assetId: Parsed asset identifier')
  console.log('')

  let totalOriginalUsd = 0
  console.log('Sample fee records (before enrichment):')
  for (let i = 0; i < Math.min(10, allFees.length); i++) {
    const fee = allFees[i]
    console.log(`\n${i + 1}. ${fee.assetName}`)
    console.log(`   Fee Amount (base units): ${fee.feeAmount}`)
    console.log(`   Original Fee USD: $${fee.originalFeeUsd}`)
    totalOriginalUsd += parseFloat(fee.originalFeeUsd)
  }
  console.log('')

  // Calculate total
  let grandTotal = 0
  for (const fee of allFees) {
    grandTotal += parseFloat(fee.originalFeeUsd)
  }

  console.log('='.repeat(80))
  console.log('BEFORE ENRICHMENT:')
  console.log(`Total fee revenue: $${grandTotal.toFixed(6)}`)
  console.log('')

  console.log('='.repeat(80))
  console.log('ENRICHMENT PROCESS:')
  console.log('='.repeat(80))
  console.log('')
  console.log('What enrichment does (from enrichment.ts):')
  console.log('1. Takes the fee record with amount (base units) and amountUsd')
  console.log('2. Moves amountUsd → originalUsdValue')
  console.log('3. Fetches CURRENT price for the asset')
  console.log('4. Recalculates: amountUsd = (amount / 10^decimals) * currentPrice')
  console.log('')
  console.log('⚠️  POTENTIAL BUG SCENARIO:')
  console.log('')
  console.log('If enrichment recalculates using current prices instead of historical')
  console.log('prices from Jan 31, 2026, the USD values would be different!')
  console.log('')
  console.log('For example:')
  console.log('- Original fee USD (Jan 31, 2026 prices): $2.96')
  console.log('- After enrichment (Feb 9, 2026 prices): $X.XX (could be higher/lower)')
  console.log('')
  console.log('This would explain a discrepancy between expected and actual revenue!')
  console.log('')

  console.log('='.repeat(80))
  console.log('KEY INSIGHT:')
  console.log('='.repeat(80))
  console.log('')
  console.log('The calculation itself is CORRECT, but enrichment changes the values.')
  console.log('')
  console.log('The "potential calculation bug" might actually be:')
  console.log('❌ Using current prices instead of historical prices')
  console.log('❌ This causes revenue to fluctuate based on current market prices')
  console.log('❌ Revenue for Jan 31 should be locked to Jan 31 prices, not today\'s')
  console.log('')

  console.log('EXPECTED BEHAVIOR:')
  console.log('For historical dates (>24h ago), use HISTORICAL prices from that date')
  console.log('For recent dates (<24h), use current prices (they\'re still current)')
  console.log('')
}

checkEnrichmentImpact().catch(console.error)
