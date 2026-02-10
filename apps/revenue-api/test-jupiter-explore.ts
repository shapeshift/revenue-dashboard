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

async function exploreJupiterData() {
  console.log('Exploring Jupiter Integration Data')
  console.log('---\n')

  for (const token of TRACKED_TOKENS) {
    console.log(`\n${token.symbol} (${token.mint})`)

    const pda = deriveReferralTokenAccount(SHAPESHIFT_JUPITER_REFERRAL_KEY, token.mint, JUPITER_AFFILIATE_CONTRACT)
    const tokenAccountPda = pda.toBase58()
    console.log(`Token Account PDA: ${tokenAccountPda}`)

    const signatures = await fetchSignatures(SHAPESHIFT_SOLANA_RPC, tokenAccountPda, 10)

    if (signatures.length === 0) {
      console.log('No signatures found')
      continue
    }

    console.log(`\nMost recent ${signatures.length} transactions:`)
    for (const sig of signatures) {
      if (!sig.blockTime) {
        console.log(`  ${sig.signature} - No timestamp`)
        continue
      }

      const date = new Date(sig.blockTime * 1000).toISOString()
      console.log(`  ${date} - ${sig.signature}`)

      const tx = await fetchTransaction(SHAPESHIFT_SOLANA_RPC, sig.signature)
      if (tx && tx.meta) {
        const feeAmount = extractFeeFromTransaction(tx)
        if (feeAmount && feeAmount > 0n) {
          const uiAmount = Number(feeAmount) / 10 ** token.decimals
          console.log(`    Fee: ${uiAmount} ${token.symbol}`)
        }
      }
    }

    console.log('\n' + '='.repeat(80))
  }
}

exploreJupiterData().catch(console.error)
