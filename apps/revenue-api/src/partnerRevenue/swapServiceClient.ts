import type { PartnerSwapRow } from './types'

const BASE = process.env.SWAP_SERVICE_URL ?? 'http://localhost:3001'
const API_KEY = process.env.SERVICE_API_KEY ?? ''

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

type Opts = { fetchImpl?: FetchLike }

type RawPartnerSwap = {
  partnerCode: string
  swapperName: string
  sellTxHash: string | null
  buyTxHash: string | null
  partnerBps: number
  affiliateBps: number | null
  feeUsd: number | null
  partnerFeeUsd: number | null
  volumeUsd: number | null
  createdAt: string
}

const toDate = (iso: string): string => iso.slice(0, 10)

export async function fetchPartnerSwaps(
  startDate: string,
  endDate: string,
  opts: Opts = {}
): Promise<PartnerSwapRow[]> {
  const doFetch = opts.fetchImpl ?? fetch
  const rows: PartnerSwapRow[] = []
  let cursor: string | null = null

  do {
    const url = new URL('/v1/affiliate/swaps', BASE)
    url.searchParams.set('startDate', startDate)
    url.searchParams.set('endDate', endDate)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await doFetch(url.toString(), { headers: { 'x-api-key': API_KEY } })
    if (!res.ok) throw new Error(`swap-service /v1/affiliate/swaps ${res.status}`)
    const body = (await res.json()) as { swaps: RawPartnerSwap[]; nextCursor: string | null }

    for (const s of body.swaps) {
      rows.push({
        partnerCode: s.partnerCode,
        swapperName: s.swapperName,
        sellTxHash: s.sellTxHash ?? null,
        buyTxHash: s.buyTxHash ?? null,
        partnerBps: s.partnerBps,
        affiliateBps: s.affiliateBps ?? null,
        feeUsd: s.feeUsd ?? null,
        partnerFeeUsd: s.partnerFeeUsd ?? null,
        volumeUsd: s.volumeUsd ?? null,
        date: toDate(s.createdAt),
      })
    }
    cursor = body.nextCursor
  } while (cursor)

  return rows
}

export async function fetchAffiliates(): Promise<{ partnerCode: string; bps: number; isActive: boolean }[]> {
  const res = await fetch(new URL('/v1/affiliate', BASE).toString(), { headers: { 'x-api-key': API_KEY } })
  if (!res.ok) throw new Error(`swap-service /v1/affiliate ${res.status}`)
  return (await res.json()) as { partnerCode: string; bps: number; isActive: boolean }[]
}
