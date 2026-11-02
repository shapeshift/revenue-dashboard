import { trackInflight } from '../utils/diagnostics'

import type { PartnerSwap } from './types'

const SWAP_SERVICE_URL = process.env['SWAP_SERVICE_URL'] as string
const SWAP_SERVICE_API_KEY = process.env['SWAP_SERVICE_API_KEY'] as string

if (!SWAP_SERVICE_URL) throw new Error('SWAP_SERVICE_URL is required')
if (!SWAP_SERVICE_API_KEY) throw new Error('SWAP_SERVICE_API_KEY is required')

const REQUEST_TIMEOUT_MS = 30_000

const getJson = (label: string, url: string): Promise<unknown> =>
  trackInflight(
    `swap-service ${label}`,
    (async () => {
      const res = await fetch(url, {
        headers: { 'x-api-key': SWAP_SERVICE_API_KEY },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`swap-service ${label} ${res.status}`)

      return res.json() as Promise<unknown>
    })()
  )

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
  attributionStatus: string
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

    const body = (await getJson('/v1/affiliate/swaps', url.toString())) as {
      swaps: AffiliateSwap[]
      nextCursor: string | null
    }

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
        attributionStatus: s.attributionStatus,
        date: s.createdAt.slice(0, 10),
      })
    }

    cursor = body.nextCursor
  } while (cursor)

  return swaps
}

export async function fetchPartners(): Promise<{ partnerCode: string; bps: number; isActive: boolean }[]> {
  return getJson('/v1/affiliate', new URL('/v1/affiliate', SWAP_SERVICE_URL).toString()) as Promise<
    { partnerCode: string; bps: number; isActive: boolean }[]
  >
}
