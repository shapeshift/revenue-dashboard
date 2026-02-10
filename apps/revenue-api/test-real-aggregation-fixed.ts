// Check what the ACTUAL timestamps are for Jan 31, 2026
console.log("Jan 31, 2026 timestamps:")
console.log("  07:38:30 UTC:", Math.floor(new Date('2026-01-31T07:38:30Z').getTime() / 1000))
console.log("  16:23:00 UTC:", Math.floor(new Date('2026-01-31T16:23:00Z').getTime() / 1000))
console.log("  20:34:06 UTC:", Math.floor(new Date('2026-01-31T20:34:06Z').getTime() / 1000))

// Simulate the EXACT aggregation logic from index.ts
const services = ['chainflip'] as const
type Service = (typeof services)[number]

interface Fees {
  service: Service
  timestamp: number
  amountUsd?: string
}

const timestampToDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toISOString().split('T')[0]
}

// The 3 ACTUAL swaps from Jan 31, 2026 (CORRECTED timestamps)
const fees: Fees[] = [
  {
    service: 'chainflip',
    timestamp: 1769845110, // 2026-01-31 07:38:30 UTC
    amountUsd: '45.712641946700000000000000000000',
  },
  {
    service: 'chainflip',
    timestamp: 1769876580, // 2026-01-31 16:23:00 UTC
    amountUsd: '53.788787190200000000000000000000',
  },
  {
    service: 'chainflip',
    timestamp: 1769891646, // 2026-01-31 20:34:06 UTC
    amountUsd: '0.271853450300000000000000000000',
  },
]

// EXACT aggregation logic from index.ts lines 155-186
const byDate: Record<string, { byService: Record<Service, number> }> = {}

console.log("\n--- Aggregation Process ---")
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
console.log(`\n=== RESULT ===`)
console.log(`Chainflip total for Jan 31, 2026: $${total.toFixed(2)}`)
console.log(`Expected: $99.77`)
console.log(`Difference: $${Math.abs(total - 99.77).toFixed(2)}`)
console.log(`Match: ${Math.abs(total - 99.77) < 0.01 ? 'YES ✓' : 'NO ✗'}`)
