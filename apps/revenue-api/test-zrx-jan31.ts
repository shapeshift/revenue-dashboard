import axios from 'axios'

const ZRX_API_KEY = '5db0d1cb-f3a3-4c38-9ff2-14347eb4ff84'
const ZRX_API_URL = 'https://api.0x.org/trade-analytics'
const SERVICES = ['swap', 'gasless'] as const

// January 31, 2026
const START_TIMESTAMP = 1769817600 // 2026-01-31 00:00:00 UTC
const END_TIMESTAMP = 1769903999   // 2026-01-31 23:59:59 UTC

type Fee = {
  token?: string
  amount?: string
  amountUsd?: string
}

type TradesResponse = {
  nextCursor?: string
  trades: Array<{
    appName: string
    blockNumber: string
    buyToken: string
    buyAmount?: string
    chainId: number
    chainName: string
    fees: {
      integratorFee?: Fee
      zeroExFee?: Fee
    }
    gasUsed: string
    protocolVersion: '0xv4' | 'Settler'
    sellToken: string
    sellAmount?: string
    slippageBps?: string
    taker: string
    timestamp: number
    tokens: Array<{
      address: string
      symbol?: string
    }>
    transactionHash: string
    volumeUsd?: string
    zid: string
    service: 'gasless' | 'swap'
  }>
  zid: string
}

async function queryZrxFees() {
  console.log('=== 0x API Query Test for January 31, 2026 ===\n')
  console.log(`Start: ${new Date(START_TIMESTAMP * 1000).toISOString()}`)
  console.log(`End: ${new Date(END_TIMESTAMP * 1000).toISOString()}\n`)

  const allTrades: TradesResponse['trades'] = []
  let totalIntegratorFeeUsd = 0
  let totalZeroExFeeUsd = 0
  let totalVolumeUsd = 0

  for (const service of SERVICES) {
    console.log(`\n--- Querying ${service} service ---`)
    let cursor: string | undefined
    let pageCount = 0

    do {
      pageCount++
      console.log(`  Page ${pageCount}${cursor ? ` (cursor: ${cursor.substring(0, 20)}...)` : ''}`)

      try {
        const { data } = await axios.get<TradesResponse>(`${ZRX_API_URL}/${service}`, {
          params: {
            cursor,
            startTimestamp: START_TIMESTAMP,
            endTimestamp: END_TIMESTAMP
          },
          headers: {
            '0x-api-key': ZRX_API_KEY,
            '0x-version': 'v2',
          },
        })

        console.log(`    Found ${data.trades.length} trades`)
        allTrades.push(...data.trades)

        // Aggregate fees
        for (const trade of data.trades) {
          if (trade.fees.integratorFee?.amountUsd) {
            totalIntegratorFeeUsd += parseFloat(trade.fees.integratorFee.amountUsd)
          }
          if (trade.fees.zeroExFee?.amountUsd) {
            totalZeroExFeeUsd += parseFloat(trade.fees.zeroExFee.amountUsd)
          }
          if (trade.volumeUsd) {
            totalVolumeUsd += parseFloat(trade.volumeUsd)
          }
        }

        cursor = data.nextCursor
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error(`    ERROR: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`)
        } else {
          console.error(`    ERROR:`, error)
        }
        break
      }
    } while (cursor)
  }

  console.log('\n\n=== SUMMARY ===')
  console.log(`Total trades: ${allTrades.length}`)
  console.log(`Total volume (USD): $${totalVolumeUsd.toFixed(2)}`)
  console.log(`Total integrator fees (USD): $${totalIntegratorFeeUsd.toFixed(2)}`)
  console.log(`Total 0x fees (USD): $${totalZeroExFeeUsd.toFixed(2)}`)

  // Expected ShapeShift revenue calculation
  // Assuming ShapeShift takes a 55% share of integrator fees (based on 0.55% total fee rate)
  const shapeshiftRevenue = totalIntegratorFeeUsd
  console.log(`\nExpected ShapeShift Revenue: $${shapeshiftRevenue.toFixed(2)}`)

  // Show sample trades
  if (allTrades.length > 0) {
    console.log('\n\n=== SAMPLE TRADES (first 5) ===')
    for (let i = 0; i < Math.min(5, allTrades.length); i++) {
      const trade = allTrades[i]
      console.log(`\nTrade ${i + 1}:`)
      console.log(`  TX Hash: ${trade.transactionHash}`)
      console.log(`  Chain: ${trade.chainName} (${trade.chainId})`)
      console.log(`  Service: ${trade.service}`)
      console.log(`  Volume (USD): $${trade.volumeUsd || '0'}`)
      console.log(`  Integrator Fee: ${trade.fees.integratorFee?.amount || '0'} ${trade.fees.integratorFee?.token ? `(${trade.fees.integratorFee.token})` : ''} = $${trade.fees.integratorFee?.amountUsd || '0'}`)
      console.log(`  0x Fee: ${trade.fees.zeroExFee?.amount || '0'} ${trade.fees.zeroExFee?.token ? `(${trade.fees.zeroExFee.token})` : ''} = $${trade.fees.zeroExFee?.amountUsd || '0'}`)
      console.log(`  Timestamp: ${new Date(trade.timestamp * 1000).toISOString()}`)
    }
  }

  // Group by chain
  const byChain: Record<string, { count: number; volumeUsd: number; integratorFeeUsd: number }> = {}
  for (const trade of allTrades) {
    if (!byChain[trade.chainName]) {
      byChain[trade.chainName] = { count: 0, volumeUsd: 0, integratorFeeUsd: 0 }
    }
    byChain[trade.chainName].count++
    byChain[trade.chainName].volumeUsd += parseFloat(trade.volumeUsd || '0')
    byChain[trade.chainName].integratorFeeUsd += parseFloat(trade.fees.integratorFee?.amountUsd || '0')
  }

  console.log('\n\n=== BREAKDOWN BY CHAIN ===')
  for (const [chain, stats] of Object.entries(byChain).sort((a, b) => b[1].integratorFeeUsd - a[1].integratorFeeUsd)) {
    console.log(`${chain}:`)
    console.log(`  Trades: ${stats.count}`)
    console.log(`  Volume: $${stats.volumeUsd.toFixed(2)}`)
    console.log(`  Integrator Fees: $${stats.integratorFeeUsd.toFixed(2)}`)
  }

  // Group by token
  const byToken: Record<string, { count: number; amountDecimal: number; amountUsd: number }> = {}
  for (const trade of allTrades) {
    if (trade.fees.integratorFee?.token && trade.fees.integratorFee?.amount) {
      const token = trade.fees.integratorFee.token
      if (!byToken[token]) {
        byToken[token] = { count: 0, amountDecimal: 0, amountUsd: 0 }
      }
      byToken[token].count++
      byToken[token].amountDecimal += parseFloat(trade.fees.integratorFee.amount)
      byToken[token].amountUsd += parseFloat(trade.fees.integratorFee.amountUsd || '0')
    }
  }

  console.log('\n\n=== BREAKDOWN BY FEE TOKEN ===')
  for (const [token, stats] of Object.entries(byToken).sort((a, b) => b[1].amountUsd - a[1].amountUsd)) {
    console.log(`${token}:`)
    console.log(`  Fee count: ${stats.count}`)
    console.log(`  Amount (decimal): ${stats.amountDecimal.toFixed(6)}`)
    console.log(`  Amount (USD): $${stats.amountUsd.toFixed(2)}`)
  }
}

queryZrxFees().catch(console.error)
