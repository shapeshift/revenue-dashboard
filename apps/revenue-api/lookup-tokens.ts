// Token addresses from Jan 31, 2026 0x data

const tokens = [
  {
    chain: 'Ethereum',
    address: '0xc770eefad204b5180df6a14ee197d99d808ee52d',
    amount: 2119.705843,
    usd: 17.46
  },
  {
    chain: 'Ethereum',
    address: '0xaea46a60368a7bd060eec7df8cba43b7ef41ad85',
    amount: 15.093045,
    usd: 2.84
  },
  {
    chain: 'Polygon',
    address: '0x9d41a63a20c76068c4e68223266f6e0613b6c962',
    amount: 0.000001,
    usd: 0.00
  }
]

console.log('=== TOKEN LOOKUP ===\n')

for (const token of tokens) {
  console.log(`${token.chain}: ${token.address}`)
  console.log(`  Amount: ${token.amount}`)
  console.log(`  USD Value: $${token.usd}`)
  console.log(`  Price per token: $${token.amount > 0 ? (token.usd / token.amount).toFixed(6) : 'N/A'}`)
  console.log()
}

// Calculate prices
console.log('Token 1 (FOX on Ethereum):')
console.log(`  Price: $17.46 / 2119.705843 = $${(17.46 / 2119.705843).toFixed(6)}`)
console.log()
console.log('Token 2 (FET on Ethereum):')
console.log(`  Price: $2.84 / 15.093045 = $${(2.84 / 15.093045).toFixed(6)}`)
