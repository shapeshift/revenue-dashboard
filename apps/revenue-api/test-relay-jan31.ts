import axios from 'axios'

const RELAY_API_URL = 'https://api.relay.link'
const SHAPESHIFT_REFERRER = 'shapeshift'
const DAO_TREASURY_BASE = '0x9c9aA90363630d4ab1D9dbF416cc3BBC8d3Ed502'

// Jan 31, 2026: 1769817600 - 1769903999 (UTC)
const startTimestamp = 1769817600
const endTimestamp = 1769903999

interface AppFee {
  recipient: string
  amount: string
  amountUsd?: string
  amountUsdCurrent?: string
}

interface RelayRequest {
  id: string
  createdAt: string
  data?: {
    appFees?: AppFee[]
    feeCurrencyObject?: {
      chainId: number
      address: string
      symbol: string
      decimals: number
    }
    metadata?: {
      currencyIn?: {
        currency?: {
          chainId: number
          address: string
          symbol: string
          decimals: number
        }
      }
    }
    inTxs?: Array<{ hash: string }>
  }
}

interface RelayResponse {
  requests: RelayRequest[]
  continuation?: string
}

async function fetchRelayData() {
  const allFees: any[] = []
  let continuation: string | undefined
  let pageCount = 0

  console.log(`\n=== Querying Relay API ===`)
  console.log(`Date: Jan 31, 2026`)
  console.log(`Start: ${startTimestamp} (${new Date(startTimestamp * 1000).toISOString()})`)
  console.log(`End: ${endTimestamp} (${new Date(endTimestamp * 1000).toISOString()})`)
  console.log(`Referrer: ${SHAPESHIFT_REFERRER}`)
  console.log(`Treasury: ${DAO_TREASURY_BASE}\n`)

  do {
    pageCount++
    console.log(`Fetching page ${pageCount}...`)

    const { data } = await axios.get<RelayResponse>(`${RELAY_API_URL}/requests/v2`, {
      params: {
        referrer: SHAPESHIFT_REFERRER,
        startTimestamp,
        endTimestamp,
        status: 'success',
        continuation,
        limit: 50,
      },
      timeout: 30000,
    })

    if (!data || !Array.isArray(data.requests)) {
      console.error('Invalid API response structure')
      break
    }

    continuation = data.continuation
    console.log(`  -> Received ${data.requests.length} requests`)

    for (const request of data.requests) {
      const appFees = request.data?.appFees ?? []
      console.log(`    Request ${request.id}: ${appFees.length} appFees`)

      if (appFees.length > 0) {
        appFees.forEach((fee, idx) => {
          console.log(`      Fee ${idx + 1}: recipient=${fee.recipient}, amount=${fee.amount}`)
        })
      }

      const relevantFees = appFees.filter(fee => fee.recipient.toLowerCase() === DAO_TREASURY_BASE.toLowerCase())

      if (relevantFees.length === 0) {
        console.log(`      ⚠️  No fees for treasury address`)
        continue
      }

      const currencyObject = request.data?.feeCurrencyObject ?? request.data?.metadata?.currencyIn?.currency
      if (!currencyObject) {
        console.warn(`  ⚠️  Skipped request ${request.id} - missing currency object`)
        continue
      }

      for (const appFee of relevantFees) {
        allFees.push({
          requestId: request.id,
          createdAt: request.createdAt,
          timestamp: Math.floor(new Date(request.createdAt).getTime() / 1000),
          txHash: request.data?.inTxs?.[0]?.hash ?? 'N/A',
          chainId: currencyObject.chainId,
          tokenSymbol: currencyObject.symbol,
          tokenAddress: currencyObject.address,
          tokenDecimals: currencyObject.decimals,
          amount: appFee.amount,
          amountUsd: appFee.amountUsd,
          amountUsdCurrent: appFee.amountUsdCurrent,
          finalAmountUsd: appFee.amountUsdCurrent ?? appFee.amountUsd,
        })
      }
    }
  } while (continuation)

  console.log(`\n=== Results ===`)
  console.log(`Total pages fetched: ${pageCount}`)
  console.log(`Total fees found: ${allFees.length}\n`)

  if (allFees.length === 0) {
    console.log('❌ No fees found for this date range!')
    return
  }

  // Print detailed fee breakdown
  console.log(`=== Detailed Fee Breakdown ===\n`)
  let totalUsd = 0
  let usingCurrent = 0
  let usingHistorical = 0

  allFees.forEach((fee, idx) => {
    console.log(`Fee #${idx + 1}:`)
    console.log(`  Request ID: ${fee.requestId}`)
    console.log(`  Created At: ${fee.createdAt}`)
    console.log(`  Timestamp: ${fee.timestamp}`)
    console.log(`  Tx Hash: ${fee.txHash}`)
    console.log(`  Chain ID: ${fee.chainId}`)
    console.log(`  Token: ${fee.tokenSymbol} (${fee.tokenAddress})`)
    console.log(`  Decimals: ${fee.tokenDecimals}`)
    console.log(`  Amount: ${fee.amount}`)
    console.log(`  amountUsd (historical): ${fee.amountUsd ?? 'N/A'}`)
    console.log(`  amountUsdCurrent (live): ${fee.amountUsdCurrent ?? 'N/A'}`)
    console.log(`  FINAL USD: $${fee.finalAmountUsd}`)

    if (fee.amountUsdCurrent) {
      console.log(`  ✓ Using amountUsdCurrent`)
      usingCurrent++
    } else {
      console.log(`  ℹ️  Using amountUsd (fallback)`)
      usingHistorical++
    }

    totalUsd += parseFloat(fee.finalAmountUsd)
    console.log()
  })

  // Summary
  console.log(`=== Summary ===`)
  console.log(`Total fees: ${allFees.length}`)
  console.log(`Using amountUsdCurrent: ${usingCurrent}`)
  console.log(`Using amountUsd (fallback): ${usingHistorical}`)
  console.log(`\n💰 TOTAL USD: $${totalUsd.toFixed(2)}`)
  console.log(`📊 Expected (from issue): $110.86`)
  console.log(`📱 Dashboard shows: $5.48`)
  console.log(`📈 Ratio: ${((totalUsd / 110.86) * 100).toFixed(1)}%`)

  // Chain breakdown
  console.log(`\n=== Chain Breakdown ===`)
  const byChain = allFees.reduce((acc, fee) => {
    const chainId = fee.chainId
    if (!acc[chainId]) {
      acc[chainId] = { count: 0, total: 0, token: fee.tokenSymbol }
    }
    acc[chainId].count++
    acc[chainId].total += parseFloat(fee.finalAmountUsd)
    return acc
  }, {} as Record<number, { count: number; total: number; token: string }>)

  Object.entries(byChain).forEach(([chainId, stats]) => {
    console.log(`Chain ${chainId}: ${stats.count} fees, $${stats.total.toFixed(2)} (${stats.token})`)
  })

  // Token breakdown
  console.log(`\n=== Token Breakdown ===`)
  const byToken = allFees.reduce((acc, fee) => {
    const token = fee.tokenSymbol
    if (!acc[token]) {
      acc[token] = { count: 0, total: 0 }
    }
    acc[token].count++
    acc[token].total += parseFloat(fee.finalAmountUsd)
    return acc
  }, {} as Record<string, { count: number; total: number }>)

  Object.entries(byToken).forEach(([token, stats]) => {
    console.log(`${token}: ${stats.count} fees, $${stats.total.toFixed(2)}`)
  })
}

fetchRelayData().catch(console.error)
