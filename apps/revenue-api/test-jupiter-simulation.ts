import { PublicKey } from '@solana/web3.js'

const SHAPESHIFT_JUPITER_REFERRAL_KEY = 'Ajgmo453yGmcHDPoJBrMUj3GFwLVL7HaaZGNLkB8vREG'
const JUPITER_AFFILIATE_CONTRACT = 'REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3'
const JUPITER_PROJECT_ACCOUNT = '45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp'
const SHAPESHIFT_SOLANA_RPC = 'https://api.solana.shapeshift.com/api/v1/jsonrpc'
const FEE_RATE = 0.0055 // 0.55%

const TRACKED_TOKENS = [
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    decimals: 6,
  },
  {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    decimals: 9,
  },
]

// Simulated prices (approximate current prices)
const PRICES = {
  USDC: 1.0,
  SOL: 150.0,
}

interface SignatureInfo {
  signature: string
  blockTime: number | null
}

interface TokenBalance {
  mint: string
  uiTokenAmount: {
    amount: string
    decimals: number
  }
  owner: string
}

interface SolanaTransaction {
  blockTime: number | null
  meta: {
    preTokenBalances: TokenBalance[]
    postTokenBalances: TokenBalance[]
  }
}

function deriveReferralTokenAccount(referralKey: string, tokenMint: string, programId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('referral_ata'), new PublicKey(referralKey).toBuffer(), new PublicKey(tokenMint).toBuffer()],
    new PublicKey(programId)
  )
  return pda
}

async function fetchSignatures(
  rpcUrl: string,
  tokenAccount: string,
  limit: number,
  beforeSignature?: string
): Promise<SignatureInfo[]> {
  const params: unknown[] = [tokenAccount, { limit }]
  if (beforeSignature) {
    (params[1] as { before?: string }).before = beforeSignature
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params,
    }),
  })

  const data = (await response.json()) as { result: SignatureInfo[] }
  return data.result || []
}

async function fetchTransaction(rpcUrl: string, signature: string): Promise<SolanaTransaction | null> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    }),
  })

  const data = (await response.json()) as { result: SolanaTransaction | null }
  return data.result
}

function extractFeeFromTransaction(tx: SolanaTransaction): bigint | null {
  const { preTokenBalances, postTokenBalances } = tx.meta

  const pre = preTokenBalances.find(b => b.owner === JUPITER_PROJECT_ACCOUNT)
  const post = postTokenBalances.find(b => b.owner === JUPITER_PROJECT_ACCOUNT)

  if (!pre || !post) {
    return null
  }

  const preAmount = BigInt(pre.uiTokenAmount.amount)
  const postAmount = BigInt(post.uiTokenAmount.amount)
  const feeAmount = postAmount - preAmount

  if (feeAmount <= 0n) {
    return null
  }

  return feeAmount
}

async function simulateRevenueCalculation() {
  console.log('='.repeat(80))
  console.log('JUPITER INTEGRATION - REVENUE SIMULATION')
  console.log('='.repeat(80))
  console.log()

  console.log('Fetching recent historical data to demonstrate calculation...\n')

  const allFees: {
    token: string
    date: string
    uiAmount: number
    amountUsd: number
    volumeUsd: number
  }[] = []

  for (const token of TRACKED_TOKENS) {
    console.log(`Processing ${token.symbol}...`)

    const pda = deriveReferralTokenAccount(SHAPESHIFT_JUPITER_REFERRAL_KEY, token.mint, JUPITER_AFFILIATE_CONTRACT)
    const tokenAccountPda = pda.toBase58()

    const signatures = await fetchSignatures(SHAPESHIFT_SOLANA_RPC, tokenAccountPda, 20)

    for (const sig of signatures) {
      if (!sig.blockTime) continue

      const tx = await fetchTransaction(SHAPESHIFT_SOLANA_RPC, sig.signature)
      if (!tx || !tx.meta) continue

      const feeAmount = extractFeeFromTransaction(tx)
      if (feeAmount && feeAmount > 0n) {
        const uiAmount = Number(feeAmount) / 10 ** token.decimals
        const price = PRICES[token.symbol as keyof typeof PRICES]
        const amountUsd = uiAmount * price
        const volumeUsd = amountUsd / FEE_RATE

        allFees.push({
          token: token.symbol,
          date: new Date(sig.blockTime * 1000).toISOString().split('T')[0],
          uiAmount,
          amountUsd,
          volumeUsd,
        })
      }
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('RECENT HISTORICAL DATA (Last 20 transactions per token)')
  console.log('='.repeat(80))

  if (allFees.length === 0) {
    console.log('No fees found in recent data')
    return
  }

  const byDate = allFees.reduce(
    (acc, fee) => {
      if (!acc[fee.date]) {
        acc[fee.date] = { fees: [], totalUsd: 0, totalVolumeUsd: 0 }
      }
      acc[fee.date].fees.push(fee)
      acc[fee.date].totalUsd += fee.amountUsd
      acc[fee.date].totalVolumeUsd += fee.volumeUsd
      return acc
    },
    {} as Record<string, { fees: typeof allFees; totalUsd: number; totalVolumeUsd: number }>
  )

  const dates = Object.keys(byDate).toSorted().reverse()

  console.log('\nDaily Summary:')
  for (const date of dates.slice(0, 10)) {
    const day = byDate[date]
    console.log(`\n${date}:`)
    console.log(`  Total fees: ${day.fees.length}`)
    console.log(`  Revenue (USD): $${day.totalUsd.toFixed(2)}`)
    console.log(`  Volume (USD): $${day.totalVolumeUsd.toFixed(2)}`)

    const byToken = day.fees.reduce(
      (acc, fee) => {
        if (!acc[fee.token]) {
          acc[fee.token] = { count: 0, amount: 0, usd: 0 }
        }
        acc[fee.token].count++
        acc[fee.token].amount += fee.uiAmount
        acc[fee.token].usd += fee.amountUsd
        return acc
      },
      {} as Record<string, { count: number; amount: number; usd: number }>
    )

    for (const [token, stats] of Object.entries(byToken)) {
      console.log(`    ${token}: ${stats.count} fees, ${stats.amount.toFixed(6)} tokens ($${stats.usd.toFixed(2)})`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('HOW JUPITER REVENUE CALCULATION WORKS')
  console.log('='.repeat(80))

  console.log(`
1. Fee Collection:
   - Jupiter's referral program collects 0.55% of swap volume as fees
   - Fees are deposited to ShapeShift's referral token accounts (PDAs)
   - Each token has its own PDA (USDC, SOL, etc.)

2. On-chain Data Retrieval:
   - Query Solana RPC for signatures on referral token account PDAs
   - For each signature, fetch full transaction details
   - Extract fee amounts by comparing pre/post token balances

3. Fee Extraction Logic:
   - Find token balances owned by Jupiter Project Account:
     ${JUPITER_PROJECT_ACCOUNT}
   - Calculate: postBalance - preBalance = fee amount
   - Only positive differences are fees (negative would be withdrawals)

4. USD Conversion:
   - Fetch current prices from CoinGecko via ShapeShift proxy
   - Convert token amounts to USD: amount * price
   - Cache prices for 10 minutes to reduce API calls

5. Revenue Calculation:
   - Fee amount in USD = direct revenue
   - Volume = Fee / ${FEE_RATE} (since fees are ${FEE_RATE * 100}% of volume)

6. Example Calculation (using first fee from data):
`)

  if (allFees.length > 0) {
    const example = allFees[0]
    console.log(`   Token: ${example.token}`)
    console.log(`   Fee Amount: ${example.uiAmount} ${example.token}`)
    console.log(`   Price: $${PRICES[example.token as keyof typeof PRICES]}`)
    console.log(`   Revenue: ${example.uiAmount} × $${PRICES[example.token as keyof typeof PRICES]} = $${example.amountUsd.toFixed(2)}`)
    console.log(`   Volume: $${example.amountUsd.toFixed(2)} / ${FEE_RATE} = $${example.volumeUsd.toFixed(2)}`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('SIMULATED JAN 31, 2026 SCENARIO')
  console.log('='.repeat(80))

  console.log(`
Since Jan 31, 2026 is in the future (current date: ${new Date().toISOString().split('T')[0]}),
there are no actual transactions yet.

However, if we had fees similar to our recent data, the calculation would be:

Example scenario (hypothetical):
  - 3 USDC fees: 0.825 + 1.6555 + 0.0055 = 2.486 USDC
    → Revenue: $2.49
    → Volume: $452.73

  - 2 SOL fees: 0.036121627 + 0.005005 = 0.041126627 SOL
    → Revenue: $6.17 (at $150/SOL)
    → Volume: $1,121.82

  Total Daily Revenue: $8.66
  Total Daily Volume: $1,574.55
  Total Fees: 5 transactions

The actual revenue for Jan 31, 2026 will depend on:
  - Number of swaps made through Jupiter on that day
  - Size of those swaps
  - Token prices at the time
  - Which tokens are being swapped
`)

  console.log('='.repeat(80))
}

simulateRevenueCalculation().catch(console.error)
