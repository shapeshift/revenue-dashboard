import type { PartnerSwap } from './types'

const SWAP_SERVICE_URL = process.env['SWAP_SERVICE_URL'] as string
const SWAP_SERVICE_API_KEY = process.env['SWAP_SERVICE_API_KEY'] as string

if (!SWAP_SERVICE_URL) throw new Error('SWAP_SERVICE_URL is required')
if (!SWAP_SERVICE_API_KEY) throw new Error('SWAP_SERVICE_API_KEY is required')

const REQUEST_TIMEOUT_MS = 30_000

type AffiliateSwap = {
  swapId: string
  status: string
  partnerCode: string
  swapperName: string
  sellTxHash: string | null
  buyTxHash: string | null
  partnerBps: number
  affiliateBps: number | null
  affiliateVerificationDetails: { affiliateBps?: number } | null
  feeUsd: string | null
  partnerFeeUsd: string | null
  volumeUsd: string | null
  affiliateFeeAssetId: string | null
  actualAffiliateFeeAmountCryptoBaseUnit: string | null
  createdAt: string
}

export async function fetchPartnerSwaps(startDate: string, endDate: string): Promise<PartnerSwap[]> {
  const swaps: PartnerSwap[] = []

  let cursor: string | null = null
  do {
    const url = new URL('/v1/affiliate/swaps', SWAP_SERVICE_URL)
    url.searchParams.set('startDate', startDate)
    url.searchParams.set('endDate', endDate)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: { 'x-api-key': SWAP_SERVICE_API_KEY },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`swap-service /v1/affiliate/swaps ${res.status}`)

    const body = (await res.json()) as { swaps: AffiliateSwap[]; nextCursor: string | null }

    for (const s of body.swaps) {
      swaps.push({
        swapId: s.swapId,
        status: s.status,
        partnerCode: s.partnerCode,
        swapperName: s.swapperName,
        sellTxHash: s.sellTxHash ?? null,
        buyTxHash: s.buyTxHash ?? null,
        partnerBps: s.partnerBps,
        affiliateBps: s.affiliateBps ?? null,
        verifiedBps: s.affiliateVerificationDetails?.affiliateBps ?? null,
        feeUsd: s.feeUsd ?? null,
        partnerFeeUsd: s.partnerFeeUsd ?? null,
        volumeUsd: s.volumeUsd ?? null,
        affiliateFeeAssetId: s.affiliateFeeAssetId ?? null,
        affiliateFeeAmountCryptoBaseUnit: s.actualAffiliateFeeAmountCryptoBaseUnit ?? null,
        date: s.createdAt.slice(0, 10),
      })
    }

    cursor = body.nextCursor
  } while (cursor)

  return swaps
}

export async function fetchPartners(): Promise<{ partnerCode: string; bps: number; isActive: boolean }[]> {
  const res = await fetch(new URL('/v1/affiliate', SWAP_SERVICE_URL).toString(), {
    headers: { 'x-api-key': SWAP_SERVICE_API_KEY },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) throw new Error(`swap-service /v1/affiliate ${res.status}`)

  return (await res.json()) as { partnerCode: string; bps: number; isActive: boolean }[]
}
