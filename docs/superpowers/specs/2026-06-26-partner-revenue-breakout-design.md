# Partner Revenue Breakout — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## Problem

The revenue dashboard attributes the **full** affiliate fee of every swap to ShapeShift. When a
partner routes a swap through ShapeShift, the on-chain affiliate is still ShapeShift's address, so
the existing per-protocol providers (thorchain, zrx, relay, cowswap, …) capture the partner's cut
too. We over-state ShapeShift revenue.

We need to:

1. Attribute only the **`shapeshiftBps`** portion of partner swaps to ShapeShift (remove the
   partner cut from our numbers).
2. Add a **Revenue by Partner** view so we can see how partners perform (and, later, expose it to
   partners themselves).

## Decisions (from brainstorming)

- **Attribution model:** swap-service is the *partner-split authority* over existing totals. The
  existing per-protocol providers remain the source of total revenue; we reclassify the
  partner-attributable slice out of ShapeShift's number.
- **Partner view scope:** Internal all-partners view now; structure the API so a partner-scoped /
  authenticated view can be added later without rework.
- **Data access:** New aggregate HTTP endpoint on swap-service (no direct DB coupling; matches the
  existing axios-per-provider pattern in revenue-api).
- **Partner identity:** Group and label by **`partnerCode`** (always present — see Assumptions).
- **Adjustment granularity:** Per **service + per date**, so every existing breakdown (totals,
  by-service, by-date) reflects ShapeShift-net revenue.
- **swap-service returns `swapperName`** (raw, required), not a pre-mapped dashboard service. The
  `swapperName → service` mapping lives in revenue-api.

## Architecture

Three layers across two repos:

```
microservices/swap-service
  └── GET /v1/affiliate/revenue-breakdown        (new, read-only aggregate)
        owns: bps/fee math, partnerCode resolution, grouping
        returns: partner-attributed revenue grouped by partnerCode × swapperName × date

revenue-dashboard/apps/revenue-api
  └── new partnerRevenue module
        fetches the breakdown (axios), maps swapperName → service,
        reconciles (subtracts partner slice from existing totals),
        adds `byPartner` + `partnerTotalUsd` to AffiliateRevenueResponse

revenue-dashboard/apps/revenue-dashboard (frontend)
  └── new PartnerBreakdown component; existing totals/charts become "ShapeShift net"
```

## Component 1 — swap-service endpoint

**Route:** `GET /v1/affiliate/revenue-breakdown?startDate=&endDate=` (added to
`apps/swap-service/src/affiliate/affiliate.controller.ts` + `affiliate.service.ts`).

**Query:** swaps where `status='SUCCESS'`, `isAffiliateVerified=true`, `partnerBps > 0`, and
`createdAt` within `[startDate, endDate]`. Only partner-attributed swaps need reclassification.

**Per-swap math (reuses existing utils):**
- `fee = calculateFeeForSwap(swap)` → `{ feeUsd, volumeUsd, verifiedBps }` (skip if null).
- `partnerRate = getPartnerFeeRate(fee.verifiedBps, swap.partnerBps)` — same as `getAffiliateStats`.
- `partnerFeeUsd = fee.feeUsd * partnerRate`
- `partnerVolumeUsd = fee.volumeUsd`

**Grouping:** by `partnerCode × swapperName × date` (date = UTC `YYYY-MM-DD` from `createdAt`).
`partnerCode` resolved from the `Affiliate` registry.

**Response:**

```ts
type RevenueBreakdownRow = {
  partnerCode: string      // always present
  swapperName: string      // raw SwapperName, e.g. "THORChain", "0x"
  date: string             // YYYY-MM-DD (UTC)
  partnerFeeUsd: number
  partnerVolumeUsd: number
  swapCount: number
}
type RevenueBreakdownResponse = { rows: RevenueBreakdownRow[] }
```

## Component 2 — revenue-api reconciliation

New module under `apps/revenue-api/src/affiliateRevenue/partnerRevenue/` (fetch + mapping +
reconciliation), wired into `AffiliateRevenue.getAffiliateRevenue` in
`affiliateRevenue/index.ts`.

**`swapperName → service` map:** revenue-api owns a lookup from raw `SwapperName` to the dashboard
`Service` ids (`thorchain`, `zrx`, `cowswap`, `relay`, `mayachain`, `chainflip`, `nearintents`,
`portals`, `butterswap`, `avnu`, `bebop`). Swappers with no dashboard counterpart (Across,
ArbitrumBridge, Cetus, Debridge, Stonfi, Sunio, Test) map to `null`.

**Reconciliation** (after `byDate`/`byService`/`byAsset` are built from existing providers):
For each breakdown row, let `service = map(swapperName)`:
- If `service` is a known dashboard service, subtract `partnerFeeUsd` from `totalUsd`,
  `byService[service]`, `byDate[date].totalUsd`, `byDate[date].byService[service]`; subtract
  `partnerVolumeUsd` from the corresponding `*Volume` aggregates. **Clamp at 0** defensively.
- If `service` is `null` (untracked swapper), **no subtraction** — that revenue was never counted
  by an existing provider, so there is nothing to remove.
- **Fee counts are never changed** — we re-attribute USD revenue/volume, not event counts.

**New response fields** (added to `AffiliateRevenueResponse` in `apps/revenue-api/src/types.ts` and
mirrored in `apps/revenue-dashboard/src/types/index.ts`):

```ts
type PartnerServiceBreakdown = Record<string, number>   // keyed by raw swapperName
type PartnerRevenue = {
  partnerCode: string
  totalUsd: number
  totalVolumeUsd: number
  swapCount: number
  byService: PartnerServiceBreakdown   // raw swapperName → usd (complete, incl. untracked)
  byDate: Record<string, number>       // date → usd
}
// added to AffiliateRevenueResponse:
byPartner: Record<string, PartnerRevenue>   // keyed by partnerCode
partnerTotalUsd: number
```

The partner view's `byService` uses **raw `swapperName`** so each partner's total is complete,
including swappers the main dashboard doesn't track. The `swapperName → service` map is used only
for the main-dashboard reconciliation.

**Caching:** the breakdown is cached per UTC date with the same daily TTL as the existing
`feeCache` (historical dates are immutable; only the current/last day is re-fetched). If the
breakdown fetch fails, log and continue with **unreconciled** (gross) numbers and an empty
`byPartner` — partner reporting degrades gracefully rather than breaking the whole dashboard.

## Component 3 — frontend

- New `apps/revenue-dashboard/src/components/PartnerBreakdown.tsx` — a sortable table (partner,
  revenue, volume, swap count), styled after `ServiceBreakdown.tsx`. Rendered in `App.tsx` from
  `data.byPartner`. Keyed by `partnerCode` so a future partner-scoped filter / auth gate drops in
  without restructuring.
- Existing "Revenue" framing clarified as **ShapeShift net** (after partner payouts); add an
  optional "Partner payouts" summary card sourced from `partnerTotalUsd`.

## Testing

- **swap-service:** bps split correctness; `partnerBps=0` excluded; grouping by
  `partnerCode × swapperName × date`; rows always carry a `partnerCode`.
- **revenue-api:** reconciliation subtracts the partner slice from `totalUsd` + `byService` +
  `byDate` for mapped swappers; unmapped swapper → no subtraction but present in `byPartner`;
  clamp-at-0; `byPartner` assembled correctly; graceful degradation when the fetch fails.
- **frontend:** `PartnerBreakdown` render + sort.

## Assumptions / dependencies

- swap-service currently has a gap where `partnerCode` is not always populated. The endpoint
  assumes `partnerCode` is **always present** for partner swaps; this gap is being fixed separately
  before/alongside this work.
- `affiliateBps = shapeshiftBps + partnerBps` for partner swaps (consistent with
  `getPartnerFeeRate`).

## Out of scope (YAGNI)

- Partner-facing authentication / per-partner access control (deferred — view is internal-only for
  now; API shape is forward-compatible).
- Reconciling fee *counts* (only USD revenue/volume re-attributed).
- Pre-aggregated/materialized rollups in swap-service (on-demand + cache is sufficient at current
  volume).
