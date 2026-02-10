import { PublicKey } from '@solana/web3.js'

const SHAPESHIFT_JUPITER_REFERRAL_KEY = 'Ajgmo453yGmcHDPoJBrMUj3GFwLVL7HaaZGNLkB8vREG'
const JUPITER_AFFILIATE_CONTRACT = 'REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3'
const JUPITER_PROJECT_ACCOUNT = '45ruCyfdRkWpRNGEqWzjCiXRHkZs8WXCLQ67Pnpye7Hp'
const SHAPESHIFT_SOLANA_RPC = 'https://api.solana.shapeshift.com/api/v1/jsonrpc'

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

async function testJupiterJan31_2026() {
  const startTimestamp = 1769817600 // Jan 31, 2026 00:00:00 UTC
  const endTimestamp = 1769903999 // Jan 31, 2026 23:59:59 UTC

  console.log('='.repeat(80))
  console.log('JUPITER INTEGRATION TEST - JAN 31, 2026')
  console.log('='.repeat(80))
  console.log(`Start: ${new Date(startTimestamp * 1000).toISOString()} (${startTimestamp})`)
  console.log(`End: ${new Date(endTimestamp * 1000).toISOString()} (${endTimestamp})`)
  console.log('='.repeat(80))
  console.log()

  const allFees: {
    token: string
    signature: string
    timestamp: number
    amount: bigint
    uiAmount: number
  }[] = []

  for (const token of TRACKED_TOKENS) {
    console.log(`\nProcessing ${token.symbol} (${token.mint})...`)

    const pda = deriveReferralTokenAccount(SHAPESHIFT_JUPITER_REFERRAL_KEY, token.mint, JUPITER_AFFILIATE_CONTRACT)
    const tokenAccountPda = pda.toBase58()
    console.log(`Token Account PDA: ${tokenAccountPda}`)

    const fees: { signature: string; timestamp: number; amount: bigint; uiAmount: number }[] = []
    let beforeSignature: string | undefined
    let totalSignaturesChecked = 0
    let reachedEndOfRange = false

    while (!reachedEndOfRange) {
      const signatures = await fetchSignatures(SHAPESHIFT_SOLANA_RPC, tokenAccountPda, 100, beforeSignature)

      if (signatures.length === 0) {
        console.log('  No more signatures found')
        break
      }

      totalSignaturesChecked += signatures.length

      for (const sig of signatures) {
        if (!sig.blockTime) {
          continue
        }

        // Stop if we've gone past the start of our range
        if (sig.blockTime < startTimestamp) {
          console.log(
            `  Reached signature before start time: ${new Date(sig.blockTime * 1000).toISOString()} (${sig.blockTime})`
          )
          reachedEndOfRange = true
          break
        }

        // Skip if before our range ends
        if (sig.blockTime > endTimestamp) {
          continue
        }

        // This signature is in our range!
        console.log(
          `  ✓ Found signature in range: ${new Date(sig.blockTime * 1000).toISOString()} (${sig.blockTime})`
        )
        console.log(`    Signature: ${sig.signature}`)

        const tx = await fetchTransaction(SHAPESHIFT_SOLANA_RPC, sig.signature)
        if (!tx || !tx.meta) {
          console.log('    ✗ No transaction data')
          continue
        }

        const feeAmount = extractFeeFromTransaction(tx)
        if (feeAmount && feeAmount > 0n) {
          const uiAmount = Number(feeAmount) / 10 ** token.decimals
          fees.push({
            signature: sig.signature,
            timestamp: sig.blockTime,
            amount: feeAmount,
            uiAmount,
          })
          allFees.push({
            token: token.symbol,
            signature: sig.signature,
            timestamp: sig.blockTime,
            amount: feeAmount,
            uiAmount,
          })
          console.log(`    ✓ Fee: ${feeAmount.toString()} (${uiAmount} ${token.symbol})`)
        } else {
          console.log('    ✗ No fee extracted')
        }
      }

      if (reachedEndOfRange) {
        break
      }

      const lastSig = signatures[signatures.length - 1]
      if (!lastSig || !lastSig.blockTime || lastSig.blockTime < startTimestamp) {
        break
      }

      beforeSignature = lastSig.signature
    }

    console.log(`\n  Summary for ${token.symbol}:`)
    console.log(`    Total signatures checked: ${totalSignaturesChecked}`)
    console.log(`    Fees found: ${fees.length}`)

    if (fees.length > 0) {
      const totalAmount = fees.reduce((sum, f) => sum + f.amount, 0n)
      const totalUi = Number(totalAmount) / 10 ** token.decimals
      console.log(`    Total amount: ${totalAmount.toString()} (${totalUi} ${token.symbol})`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('FINAL RESULTS')
  console.log('='.repeat(80))

  if (allFees.length === 0) {
    console.log('No fees found for Jan 31, 2026')
    console.log('\nThis is expected if:')
    console.log('  1. The current date is before Jan 31, 2026')
    console.log('  2. No swaps were made through Jupiter on Jan 31, 2026')
    console.log('  3. No fees were collected on that day')
  } else {
    console.log(`Total fees across all tokens: ${allFees.length}`)
    console.log('\nDetailed breakdown:')

    const feesByToken = allFees.reduce(
      (acc, f) => {
        if (!acc[f.token]) {
          acc[f.token] = { count: 0, total: 0 }
        }
        acc[f.token].count++
        acc[f.token].total += f.uiAmount
        return acc
      },
      {} as Record<string, { count: number; total: number }>
    )

    for (const [token, stats] of Object.entries(feesByToken)) {
      console.log(`\n${token}:`)
      console.log(`  Fee transactions: ${stats.count}`)
      console.log(`  Total collected: ${stats.total} ${token}`)
    }

    console.log('\nIndividual transactions:')
    for (const fee of allFees) {
      console.log(
        `  ${new Date(fee.timestamp * 1000).toISOString()} | ${fee.uiAmount} ${fee.token} | ${fee.signature}`
      )
    }
  }

  console.log('\n' + '='.repeat(80))
}

testJupiterJan31_2026().catch(console.error)
