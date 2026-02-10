import axios from 'axios'

// Fetch a single day of MayaChain fees from Jan 31, 2026
const start = new Date('2026-01-31T00:00:00Z').getTime()
const end = new Date('2026-02-01T00:00:00Z').getTime()

console.log('Fetching MayaChain fees for Jan 20, 2026...')
console.log(`Start: ${start}, End: ${end}`)

const { data } = await axios.get<{
  fees: Array<{
    address: string
    amount: string
    asset: string
    blockHash: string
    blockHeight: number
    timestamp: number
    txId: string
  }>
}>('https://api.mayachain.shapeshift.com/api/v1/affiliate/fees', {
  params: { start, end },
})

console.log(`\nTotal fees returned: ${data.fees.length}`)

if (data.fees.length > 0) {
  console.log('\nFirst 5 fee samples:')
  data.fees.slice(0, 5).forEach((fee, idx) => {
    const rawAmount = Number(fee.amount)
    const with8decimals = rawAmount / 10 ** 8
    const with10decimals = rawAmount / 10 ** 10

    console.log(`\n${idx + 1}. TxId: ${fee.txId}`)
    console.log(`   Raw amount: ${fee.amount}`)
    console.log(`   If 8 decimals: ${with8decimals.toFixed(4)} CACAO`)
    console.log(`   If 10 decimals: ${with10decimals.toFixed(4)} CACAO`)
  })

  // Calculate total for the day
  const totalRaw = data.fees.reduce((sum, f) => sum + Number(f.amount), 0)
  const totalWith8 = totalRaw / 10 ** 8
  const totalWith10 = totalRaw / 10 ** 10

  console.log(`\n=== DAILY TOTAL ===`)
  console.log(`Total fees (8 decimals): ${totalWith8.toFixed(2)} CACAO`)
  console.log(`Total fees (10 decimals): ${totalWith10.toFixed(2)} CACAO`)

  // At current CACAO price (fetch from CoinGecko)
  const priceRes = await axios.get('https://api.proxy.shapeshift.com/api/v1/markets/simple/price', {
    params: {
      vs_currencies: 'usd',
      ids: 'cacao',
    },
  })
  const cacaoPrice = Number(priceRes.data.cacao.usd)
  console.log(`\nCurrent CACAO price: $${cacaoPrice}`)
  console.log(`Revenue if 8 decimals: $${(totalWith8 * cacaoPrice).toFixed(2)}`)
  console.log(`Revenue if 10 decimals: $${(totalWith10 * cacaoPrice).toFixed(2)}`)
}
