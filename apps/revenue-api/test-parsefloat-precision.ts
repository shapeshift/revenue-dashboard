/**
 * Test parseFloat precision with Chainflip's actual amountUsd values
 */

console.log('=== parseFloat Precision Test ===\n')

const actualValues = [
  '45.712641946700000000000000000000',
  '53.788787190200000000000000000000',
  '0.271853450300000000000000000000',
]

console.log('Testing actual Chainflip amountUsd values:\n')

let sum = 0
for (const val of actualValues) {
  const parsed = parseFloat(val || '0')
  console.log(`"${val}"`)
  console.log(`  → parseFloat: ${parsed}`)
  console.log(`  → toString: "${parsed.toString()}"`)
  console.log(`  → precision: ${parsed.toString().length} chars`)
  sum += parsed
  console.log()
}

console.log('=== Summary ===')
console.log(`Sum of parsed values: ${sum}`)
console.log(`Sum toString: "${sum.toString()}"`)
console.log(`Expected: 99.7732825872`)
console.log(`Match: ${sum === 99.7732825872 ? '✓ YES' : '✗ NO'}`)
console.log(`Difference: ${Math.abs(sum - 99.7732825872)}`)

console.log('\n=== Manual verification ===')
const manual = 45.712641946700000000000000000000 + 53.788787190200000000000000000000 + 0.271853450300000000000000000000
console.log(`Manual JS calculation: ${manual}`)
console.log(`Match with parseFloat sum: ${manual === sum ? '✓ YES' : '✗ NO'}`)
