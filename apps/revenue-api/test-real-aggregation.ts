// Simulate the EXACT aggregation logic from index.ts
const services = ['chainflip'] as const
type Service = (typeof services)[number]

const FEE_RATE = 0.0055

interface Fees {
  service: Service
  timestamp: number
  amountUsd?: string
}

const timestampToDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toISOString().split('T')[0]
}

// The 3 ACTUAL swaps from Jan 31, 2026
const fees: Fees[] = [
  {
    service: 'chainflip',
    timestamp: 1738282710, // 07:38:30 UTC
    amountUsd: '45.712641946700000000000000000000',
  },
  {
    service: 'chainflip',
    timestamp: 1738313780, // 16:23:00 UTC
    amountUsd: '53.788787190200000000000000000000',
  },
  {
    service: 'chainflip',
    timestamp: 1738329246, // 20:34:06 UTC
    amountUsd: '0.271853450300000000000000000000',
  },
]

// EXACT aggregation logic from index.ts lines 155-186
const byDate: Record<string, { byService: Record<Service, number> }> = {}

for (const fee of fees) {
  const date = timestampToDate(fee.timestamp)
  const amountUsd = parseFloat(fee.amountUsd || '0')
  
  console.log(`Processing: date=${date}, amountUsd=${amountUsd}`)

  if (!byDate[date]) {
    byDate[date] = {
      byService: { chainflip: 0 },
    }
  }

  byDate[date].byService[fee.service] += amountUsd
  console.log(`  Running total: ${byDate[date].byService[fee.service]}`)
}

console.log("\nFinal aggregation:")
console.log(JSON.stringify(byDate, null, 2))

const total = byDate['2026-01-31']?.byService?.chainflip || 0
console.log(`\nChainflip total for Jan 31: $${total}`)
console.log(`Expected: $99.77`)
console.log(`Match: ${Math.abs(total - 99.77) < 0.01 ? 'YES ✓' : 'NO ✗'}`)
