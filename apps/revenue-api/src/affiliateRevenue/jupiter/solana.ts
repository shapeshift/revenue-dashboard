import { PublicKey } from '@solana/web3.js'

import { JUPITER_PROJECT_ACCOUNT } from './constants'
import type { SignatureInfo, SolanaTransaction } from './types'

export function deriveReferralTokenAccount(referralKey: string, tokenMint: string, programId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('referral_ata'), new PublicKey(referralKey).toBuffer(), new PublicKey(tokenMint).toBuffer()],
    new PublicKey(programId)
  )
  return pda
}

export async function fetchSignatures(
  rpcUrl: string,
  tokenAccount: string,
  limit: number,
  beforeSignature?: string
): Promise<SignatureInfo[]> {
  const params: unknown[] = [tokenAccount, { limit }]
  if (beforeSignature) {
    ;(params[1] as { before?: string }).before = beforeSignature
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

export async function fetchTransaction(rpcUrl: string, signature: string): Promise<SolanaTransaction | null> {
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

export function extractFeeFromTransaction(tx: SolanaTransaction): string | null {
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

  return feeAmount.toString()
}
