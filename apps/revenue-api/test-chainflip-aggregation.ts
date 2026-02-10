/**
 * Test script to trace Chainflip fee aggregation
 * Simulates the aggregation flow from lines 158-238 of affiliateRevenue/index.ts
 */

import type { Fees } from './src/affiliateRevenue/index'
import type { Service } from './src/types'
import { services } from './src/types'

// Mock the 3 Chainflip swaps from Jan 31, 2026
const mockChainflipFees: Fees[] = [
  {
    chainId: 'eip155:1',
    assetId: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    service: 'chainflip',
    txHash: '',
    timestamp: 1738368000, // Jan 31, 2026 00:00:00 UTC
    amount: '260000', // 0.26 USDC (6 decimals)
    amountUsd: '0.26',
  },
  {
    chainId: 'eip155:1',
    assetId: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    service: 'chainflip',
    txHash: '',
    timestamp: 1738368000,
    amount: '250000', // 0.25 USDC (6 decimals)
    amountUsd: '0.25',
  },
  {
    chainId: 'eip155:1',
    assetId: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    service: 'chainflip',
    txHash: '',
    timestamp: 1738368000,
    amount: '260000', // 0.26 USDC (6 decimals)
    amountUsd: '0.26',
  },
]

function timestampToDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().split('T')[0]
}

console.log('=== Chainflip Fee Aggregation Test ===\n')

// Simulate the aggregation logic from lines 158-238
const byDate: Record<string, any> = {}
let totalAmountUsd = 0

for (const fee of mockChainflipFees) {
  console.log('\nProcessing fee:', {
    service: fee.service,
    amount: fee.amount,
    amountUsd: fee.amountUsd,
    timestamp: fee.timestamp,
  })

  const date = timestampToDate(fee.timestamp)
  console.log(`  → Date: ${date}`)

  // Line 160: parseFloat(fee.amountUsd || '0')
  const amountUsd = parseFloat(fee.amountUsd || '0')
  console.log(`  → Parsed amountUsd: ${amountUsd} (from "${fee.amountUsd}")`)
  totalAmountUsd += amountUsd

  // Lines 171-181: Initialize byDate[date] if not exists
  if (!byDate[date]) {
    console.log(`  → Initializing byDate["${date}"]`)
    byDate[date] = {
      totalUsd: 0,
      byService: Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>,
    }
  }

  // Line 183: Daily total
  byDate[date].totalUsd += amountUsd
  console.log(`  → byDate["${date}"].totalUsd = ${byDate[date].totalUsd}`)

  // Line 186: Service-specific aggregation (THE CRITICAL LINE)
  byDate[date].byService[fee.service] += amountUsd
  console.log(`  → byDate["${date}"].byService["${fee.service}"] = ${byDate[date].byService[fee.service]}`)
}

console.log('\n=== After Daily Aggregation ===')
console.log('Total amountUsd across all fees:', totalAmountUsd)
console.log('\nbyDate structure:')
for (const [date, data] of Object.entries(byDate)) {
  console.log(`\n${date}:`)
  console.log(`  totalUsd: ${data.totalUsd}`)
  console.log(`  byService.chainflip: ${data.byService.chainflip}`)
}

// Lines 211-221: Global aggregation
const byService = Object.fromEntries(services.map(s => [s, 0])) as Record<Service, number>

for (const daily of Object.values(byDate)) {
  for (const service of services) {
    byService[service] += daily.byService[service]
  }
}

console.log('\n=== After Global Aggregation ===')
console.log('Global byService.chainflip:', byService.chainflip)
console.log('\nExpected: 0.77')
console.log('Actual:', byService.chainflip)
console.log('Match:', byService.chainflip === 0.77 ? '✓ YES' : '✗ NO')

// Check for potential issues
console.log('\n=== Potential Issues Check ===')

// Issue 1: parseFloat on malformed strings
console.log('\n1. parseFloat testing:')
const testValues = ['0.26', '0.25', '.77', '0.77', undefined, null, '']
for (const val of testValues) {
  const parsed = parseFloat((val as any) || '0')
  console.log(`  parseFloat("${val}" || "0") = ${parsed}`)
}

// Issue 2: Service name check
console.log('\n2. Service name verification:')
console.log(`  fee.service = "${mockChainflipFees[0].service}"`)
console.log(`  Is in services array? ${services.includes(mockChainflipFees[0].service)}`)
console.log(`  Type check: ${typeof mockChainflipFees[0].service}`)

// Issue 3: Floating point precision
console.log('\n3. Floating point precision:')
const sum1 = 0.26 + 0.25 + 0.26
const sum2 = parseFloat('0.26') + parseFloat('0.25') + parseFloat('0.26')
console.log(`  0.26 + 0.25 + 0.26 = ${sum1}`)
console.log(`  parseFloat sum = ${sum2}`)
console.log(`  Expected: 0.77`)
console.log(`  Difference: ${Math.abs(sum1 - 0.77)}`)
