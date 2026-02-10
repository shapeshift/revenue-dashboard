// Test date boundary issues
const timestampToDate = (timestamp: number): string => {
  return new Date(timestamp * 1000).toISOString().split('T')[0]
}

// The 3 swaps from Jan 31, 2026
const swaps = [
  { time: '2026-01-31T07:38:30Z', usd: 45.71 },
  { time: '2026-01-31T16:23:00Z', usd: 53.79 },
  { time: '2026-01-31T20:34:06Z', usd: 0.27 },
]

console.log("Swap timestamps:")
swaps.forEach(swap => {
  const timestamp = Math.floor(new Date(swap.time).getTime() / 1000)
  const date = timestampToDate(timestamp)
  console.log(`  ${swap.time} → timestamp: ${timestamp} → date: ${date}`)
})

// What if the dashboard queries PST?
console.log("\nIf dashboard uses PST (UTC-8):")
console.log("  Jan 31 PST = Jan 31 00:00:00 PST = Jan 31 08:00:00 UTC")
console.log("  Start: 1738310400 (Jan 31 08:00 UTC)")
console.log("  End:   1738396799 (Feb 01 07:59:59 UTC)")

const pstStart = Math.floor(new Date('2026-01-31T08:00:00Z').getTime() / 1000)
const pstEnd = Math.floor(new Date('2026-02-01T07:59:59Z').getTime() / 1000)

console.log("\nSwaps included in PST query:")
swaps.forEach(swap => {
  const timestamp = Math.floor(new Date(swap.time).getTime() / 1000)
  if (timestamp >= pstStart && timestamp <= pstEnd) {
    console.log(`  ✓ ${swap.time} → $${swap.usd}`)
  } else {
    console.log(`  ✗ ${swap.time} → $${swap.usd} (EXCLUDED)`)
  }
})

// What's the total with PST filtering?
let pstTotal = 0
swaps.forEach(swap => {
  const timestamp = Math.floor(new Date(swap.time).getTime() / 1000)
  if (timestamp >= pstStart && timestamp <= pstEnd) {
    pstTotal += swap.usd
  }
})

console.log(`\nPST Total: $${pstTotal}`)
console.log(`Expected: $99.77`)
console.log(`Actual (from dashboard): $41.05`)
console.log(`\nDoes PST explain the discrepancy? ${pstTotal === 99.77 ? 'NO' : 'NO'}`)
