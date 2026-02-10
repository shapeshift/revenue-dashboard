import axios from 'axios'
import BigNumber from 'bignumber.js'

const ZRX_API_KEY = '5db0d1cb-f3a3-4c38-9ff2-14347eb4ff84'
const ZRX_API_URL = 'https://api.0x.org/trade-analytics'
const SERVICES = ['swap', 'gasless'] as const
const NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

// January 31, 2026
const START_TIMESTAMP = 1769817600
const END_TIMESTAMP = 1769903999

type Fee = {
  token?: string
  amount?: string
  amountUsd?: string
}

type TradesResponse = {
  nextCursor?: string
  trades: Array<{
    chainId: number
    fees: {
      integratorFee?: Fee
    }
    timestamp: number
    transactionHash: string
  }>
}

type ProcessedFee = {
  chainId: string
  assetId: string
  service: string
  txHash: string
  timestamp: number
  amount: string // in base units (wei)
  amountUsd?: string
  originalUsdValue?: string
}

// Mock asset service with known decimals
const mockAssetDecimals: Record<string, number> = {
  // FOX token on Ethereum
  'eip155:1/erc20:0xc770eefad204b5180df6a14ee197d99d808ee52d': 18,
  // FET token on Ethereum
  'eip155:1/erc20:0xaea46a60368a7bd060eec7df8cba43b7ef41ad85': 18,
  // USDT on Polygon
  'eip155:137/erc20:0x9d41a63a20c76068c4e68223266f6e0613b6c962': 6,
}

const getAssetDecimals = (assetId: string): number => {
  return mockAssetDecimals[assetId] || 18
}

const safeAmountToString = (amount: string | number | undefined): string => {
  if (amount === undefined || amount === null) return ''
  return typeof amount === 'string' ? amount : String(amount)
}

const bn = (value: string | number): BigNumber => new BigNumber(value)

const decimalToBaseUnit = (decimalAmount: string, decimals: number): string => {
  const amount = bn(decimalAmount.trim())
  const multiplier = bn(10).pow(decimals)
  const baseUnitAmount = amount.times(multiplier)
  return baseUnitAmount.toFixed(0, BigNumber.ROUND_DOWN)
}

const baseUnitToTokenAmount = (amount: string, decimals: number): string => {
  const amountBN = bn(amount)
  const divisor = bn(10).pow(decimals)
  return amountBN.div(divisor).toFixed(18, BigNumber.ROUND_DOWN)
}

async function testIntegrationFlow() {
  console.log('=== Testing 0x Integration Flow for January 31, 2026 ===\n')

  const processedFees: ProcessedFee[] = []

  for (const service of SERVICES) {
    let cursor: string | undefined

    do {
      const { data } = await axios.get<TradesResponse>(`${ZRX_API_URL}/${service}`, {
        params: { cursor, startTimestamp: START_TIMESTAMP, endTimestamp: END_TIMESTAMP },
        headers: {
          '0x-api-key': ZRX_API_KEY,
          '0x-version': 'v2',
        },
      })

      for (const trade of data.trades) {
        const token = trade.fees.integratorFee?.token
        const rawAmount = safeAmountToString(trade.fees.integratorFee?.amount)

        if (!rawAmount || !token) continue

        const chainId = `eip155:${trade.chainId}`
        const assetId = token.toLowerCase() === NATIVE_TOKEN_ADDRESS
          ? `${chainId}/slip44:60`
          : `${chainId}/erc20:${token}`

        // CRITICAL: 0x API returns amounts in DECIMAL format (e.g., "2.5" USDC)
        // Convert to wei (smallest units) for consistency
        const decimals = getAssetDecimals(assetId)
        const amountInWei = decimalToBaseUnit(rawAmount, decimals)

        processedFees.push({
          chainId,
          assetId,
          service: 'zrx',
          txHash: trade.transactionHash,
          timestamp: trade.timestamp,
          amount: amountInWei,
          amountUsd: trade.fees.integratorFee?.amountUsd,
        })
      }

      cursor = data.nextCursor
    } while (cursor)
  }

  console.log(`\nProcessed ${processedFees.length} fees\n`)

  // Show processed fees with conversions
  console.log('=== PROCESSED FEES ===\n')
  for (const fee of processedFees) {
    console.log(`TX: ${fee.txHash}`)
    console.log(`  Asset: ${fee.assetId}`)
    console.log(`  Chain: ${fee.chainId}`)

    const decimals = getAssetDecimals(fee.assetId)
    const tokenAmount = baseUnitToTokenAmount(fee.amount, decimals)

    console.log(`  Amount (base units): ${fee.amount}`)
    console.log(`  Amount (token): ${tokenAmount}`)
    console.log(`  Amount (USD): $${fee.amountUsd || '0'}`)
    console.log(`  Decimals: ${decimals}`)
    console.log()
  }

  // Calculate totals
  let totalUsd = 0
  const byAsset: Record<string, { tokenAmount: string; usdAmount: number; count: number }> = {}

  for (const fee of processedFees) {
    const usd = parseFloat(fee.amountUsd || '0')
    totalUsd += usd

    if (!byAsset[fee.assetId]) {
      byAsset[fee.assetId] = { tokenAmount: '0', usdAmount: 0, count: 0 }
    }

    const decimals = getAssetDecimals(fee.assetId)
    const tokenAmount = baseUnitToTokenAmount(fee.amount, decimals)

    // Add token amounts
    byAsset[fee.assetId].tokenAmount = bn(byAsset[fee.assetId].tokenAmount)
      .plus(bn(tokenAmount))
      .toFixed(18)

    byAsset[fee.assetId].usdAmount += usd
    byAsset[fee.assetId].count += 1
  }

  console.log('=== TOTALS BY ASSET ===\n')
  for (const [assetId, stats] of Object.entries(byAsset)) {
    console.log(`${assetId}:`)
    console.log(`  Fee Count: ${stats.count}`)
    console.log(`  Token Amount: ${stats.tokenAmount}`)
    console.log(`  USD Amount: $${stats.usdAmount.toFixed(2)}`)
    console.log()
  }

  console.log('=== FINAL SUMMARY ===')
  console.log(`Total Fees Collected: ${processedFees.length}`)
  console.log(`Total Revenue (USD): $${totalUsd.toFixed(2)}`)
  console.log(`Expected ShapeShift Revenue: $${totalUsd.toFixed(2)}`)

  // Verify calculations match API
  console.log('\n=== VERIFICATION ===')
  console.log('API reported integrator fees: $20.30')
  console.log(`Our calculation: $${totalUsd.toFixed(2)}`)
  console.log(`Match: ${Math.abs(totalUsd - 20.30) < 0.01 ? '✓ YES' : '✗ NO'}`)
}

testIntegrationFlow().catch(console.error)
