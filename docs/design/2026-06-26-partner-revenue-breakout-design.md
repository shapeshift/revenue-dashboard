# Partner Revenue Breakout — Design

**Date:** 2026-06-26
**Status:** Implemented

## Problem

The revenue dashboard attributes the **full** affiliate fee of every swap to ShapeShift. When a
partner routes a swap through ShapeShift, the on-chain affiliate is still ShapeShift's address, so
the existing per-protocol providers (thorchain, zrx, relay, cowswap, …) capture the partner's cut
too. We over-state ShapeShift revenue.

We need to:

1. Make the **main revenue page/endpoint report ShapeShift-only revenue** — partner cuts peeled
   out, no partner revenue, no double accounting.
2. Add a **separate Partners page/endpoint** breaking down revenue by partner (internal now;
   partner-facing later).

A dollar from a partner swap is counted **once**: ShapeShift's `shapeshiftBps` share on the main
page, the partner's `partnerBps` share on the Partners page. The two never overlap.

## Decisions (from brainstorming)

- **Attribution model:** swap-service is the *partner-split authority*. Existing per-protocol
  providers remain the source of gross revenue; we **settle** partner swaps against that gross,
  per swap, and move the partner slice out of ShapeShift's number.
- **Settlement is per-swap, not aggregate.** revenue-api pulls all affiliates + all partner swaps
  from swap-service and joins each partner swap to the matching provider fee event, splitting that
  event's own USD by the swap's `partnerBps / affiliateBps`. (An earlier aggregate-subtraction
  approach was rejected — it mixed swap-service USD with provider USD and could over/under-shoot.)
- **Two endpoints / two pages:** main `revenue` (ShapeShift-net only) and new `partner/revenue`
  (by-partner). Partner data never appears in the main response.
- **Partner identity:** `partnerCode` (the attribution key; see "Current swap-service state").
- **Data access:** new read endpoint(s) on swap-service; revenue-api fetches via axios/fetch and
  does the bucketing + settlement.
- **Frontend:** lightweight in-app tab/nav (no new routing dep) → "Revenue" and "Partners" views.

## Current swap-service state (verified on `develop`)

The partnerCode migration is complete on `develop`:

- `Affiliate.partnerCode` is `String @unique` (required); `Swap.partnerCode String?` with a relation
  to `Affiliate` + index. Populated at swap creation via `SwapsService.resolvePartner()` (from
  `data.partnerCode`, else resolving `partnerAddress → partnerCode`).
- `AffiliateService.getAffiliateStats(partnerCode, …)` / `getAffiliateSwaps(partnerCode, …)` are
  keyed by `partnerCode`, filtering `status='SUCCESS'`, `isAffiliateVerified=true`.
- Fee math (`calculateFeeForSwap`, `getPartnerFeeRate`) lives in `apps/swap-service/src/swaps/utils.ts`.

Caveat: `Swap.partnerCode` is nullable, so partner swaps created *before* the migration may have a
`partnerAddress` but no `partnerCode`; those are out of scope (the breakout is forward-looking).
Historical backfill, if wanted, is a separate task.

## Architecture

```
microservices/swap-service  (develop; all routes behind global ApiKeyGuard)
  ├── GET /v1/affiliate                          (new) list all affiliates (registry)
  └── GET /v1/affiliate/swaps                     (extended) partnerCode now OPTIONAL
        omitted  → all partner swaps (partnerCode NOT NULL)
        provided → that partner's swaps (existing behavior, unchanged)
        rows enriched (additive) with: affiliateBps, feeUsd, partnerFeeUsd

revenue-dashboard/apps/revenue-api  (sends x-api-key: SERVICE_API_KEY to swap-service)
  ├── partnerSettlement service  (new, shared)
  │     fetches registry + partner swaps, indexes swaps by normalized txHash,
  │     walks existing provider fee events, splits matched events by bps,
  │     produces { shapeshiftNet: {...}, byPartner: {...}, unreconciled: {...} }
  ├── GET /api/v1/affiliate/revenue   (existing) → ShapeShift-net only (no byPartner)
  └── GET /api/v1/partner/revenue     (new)      → by-partner breakdown

revenue-dashboard/apps/revenue-dashboard (frontend)
  ├── tab nav: "Revenue" | "Partners"
  ├── Revenue view (existing components; numbers now net)
  └── Partners view (new PartnerBreakdown + usePartnerRevenue hook)
```

## Component 1 — swap-service endpoints

Changes in `apps/swap-service/src/affiliate/{affiliate.controller.ts,affiliate.service.ts,types.ts}`.
The whole service is behind the global `ApiKeyGuard` (`APP_GUARD` in `app.module.ts`), so both
routes below are already authed — no per-route guard needed. Callers send `x-api-key: SERVICE_API_KEY`.

### Why reuse `affiliate/swaps` instead of a new endpoint

`/v1/affiliate/*` is the owner/reporting surface for affiliate entities (`swaps`, `stats`, CRUD);
`/v1/partner/:code` is a narrow outward resolver (code → fee split at quote time). Listing all
affiliates and all their swaps is reporting over affiliate entities → it belongs under
`/v1/affiliate`. So we generalize the existing endpoints rather than add parallel ones. (The
affiliate/partner naming overlap is pre-existing; unifying the namespaces is out of scope.)

**`GET /v1/affiliate`** (new) — list all affiliates: `{ partnerCode, bps, isActive }[]`. Lets the
Partners page show every registered partner (including zero-activity ones). Coexists with the
existing `GET /v1/affiliate/:address`.

**`GET /v1/affiliate/swaps?partnerCode?=&startDate=&endDate=&cursor=&limit=`** (extended) — make
`partnerCode` **optional** in `AffiliateSwapsQueryDto` (`@IsOptional()` + keep the format `@Matches`
when present):

- `partnerCode` provided → unchanged single-partner behavior.
- `partnerCode` omitted → `where: { partnerCode: { not: null }, status:'SUCCESS',
  isAffiliateVerified:true, …dateRange }` (all partner swaps). No `origin` filter (consistency with
  the partner-facing stats numbers). Same cursor pagination (`swapCursorArgs` / `getNextCursor`).
- **Enrich each returned row** (additive — existing single-partner UI consumer ignores extras) with
  the computed split, keeping fee math in swap-service: `affiliateBps` (verified),
  `feeUsd = calculateFeeForSwap(swap).feeUsd`, and
  `partnerFeeUsd = feeUsd * getPartnerFeeRate(verifiedBps, partnerBps)`.

The response stays `{ swaps, nextCursor }`; each swap gains `{ affiliateBps, feeUsd, partnerFeeUsd }`.
revenue-api reads `swapperName`, `sellTxHash`, `buyTxHash`, `partnerBps`, `shapeshiftBps`,
`affiliateBps`, `partnerCode`, `createdAt` for the join/split; `feeUsd`/`partnerFeeUsd` (swap-service
valuation) are used only for the unmatched fallback and Partners-view rows with no provider match.
Matched swaps use the provider's USD.

## Component 2 — revenue-api settlement

New shared module `apps/revenue-api/src/affiliateRevenue/partnerSettlement/`, invoked by both
endpoints. `swapperName → service` map (raw `SwapperName` → dashboard `Service` id) lives here.

**Inputs:** the existing per-provider fee events (already produced in
`AffiliateRevenue.getAffiliateRevenue`), plus the affiliate registry (`GET /v1/affiliate`) and all
partner swaps (`GET /v1/affiliate/swaps` with no `partnerCode`, paginated to completion) fetched from
swap-service with the `x-api-key: SERVICE_API_KEY` header. Cached per date with daily TTL.

**Settlement algorithm:**

1. Build the gross `byDate` / `byService` / `byAsset` from existing providers (unchanged today).
2. Index partner swaps by **normalized txHash** (lowercase; index both `sellTxHash` and `buyTxHash`).
3. For each existing provider fee event with a non-empty txHash that matches a partner swap:
   - `partnerShare = feeEvent.amountUsd * (partnerBps / affiliateBps)`
   - `shapeshiftShare = feeEvent.amountUsd − partnerShare`
   - Subtract `partnerShare` (and the proportional volume) from ShapeShift's `totalUsd`, `byService[mappedService]`,
     `byDate[date]`, and the asset bucket. Add `partnerShare` to `byPartner[partnerCode]`, bucketed
     by the swap's raw `swapperName` + date. ShapeShift keeps `shapeshiftShare`. (Subtraction uses
     the mapped dashboard `service`; the partner view buckets by raw `swapperName` so a partner's
     totals stay complete even for untracked swappers.)
4. **Unmatched partner swaps** (empty/absent txHash — e.g. chainflip — or no matching fee event):
   fall back to swap-service's `partnerFeeUsd`. Subtract it (aggregate) from the matching service
   bucket and add to `byPartner`; accumulate `unreconciled.count` / `unreconciled.usd`.
5. **Fee counts unchanged** — only USD revenue/volume is re-attributed.

Result: `{ shapeshiftNet, byPartner, unreconciled }`, computed once and shared by both endpoints.

**Main endpoint** `GET /api/v1/affiliate/revenue` returns `shapeshiftNet` shaped exactly like today's
`AffiliateRevenueResponse` (no `byPartner`), plus an `unreconciled` summary so no one silently reads
over/under-stated numbers.

**Partner endpoint** `GET /api/v1/partner/revenue?startDate=&endDate=` returns:

```ts
type PartnerRevenue = {
  partnerCode: string
  totalUsd: number
  totalVolumeUsd: number
  swapCount: number
  byService: Record<string, number>   // raw swapperName → usd (complete)
  byDate: Record<string, number>      // date → usd
}
type PartnerRevenueResponse = {
  byPartner: Record<string, PartnerRevenue>  // keyed by partnerCode
  partnerTotalUsd: number
  affiliates: { partnerCode: string; bps: number; isActive: boolean }[]  // incl. zero-activity
  unreconciled: { count: number; usd: number }
}
```

Route wiring is Hono (`apps/revenue-api/src/routes/`), mirroring the existing
`affiliateRevenue.ts` (date validation, error shape).

## Component 3 — frontend

- Tab/nav state in `App.tsx` (dependency-free) → "Revenue" and "Partners".
- **Revenue view:** existing components unchanged; the numbers are now ShapeShift-net. Optional
  small note when `unreconciled.usd > 0`.
- **Partners view:** `usePartnerRevenue` hook (fetches `/api/v1/partner/revenue`) +
  `PartnerBreakdown.tsx` — sortable table (partner, revenue, volume, swap count), styled after
  `ServiceBreakdown.tsx`, with per-partner service/date drill-down. Keyed by `partnerCode` so a
  future partner-scoped / authenticated filter drops in cleanly.
- Add `PartnerRevenueResponse` types to `apps/revenue-dashboard/src/types/index.ts`.

## Testing

- **swap-service:** `affiliate/swaps` with `partnerCode` omitted returns all partner swaps
  (`partnerCode NOT NULL`, SUCCESS, verified) and with it provided is unchanged; enriched
  `affiliateBps`/`feeUsd`/`partnerFeeUsd` math; pagination; `GET /v1/affiliate` returns all affiliates.
- **revenue-api settlement:** matched fee event splits by bps (provider USD, not swap-service USD);
  `shapeshiftShare + partnerShare == amountUsd` (no double count / no loss); unmatched swap →
  `partnerFeeUsd` fallback + `unreconciled` accounting; `swapperName → service` mapping (unmapped
  swapper still appears in `byPartner`); main endpoint omits `byPartner`; both endpoints share one
  cached settlement.
- **frontend:** tab switch; `PartnerBreakdown` render/sort; net numbers on Revenue view.

## Assumptions / dependencies

- `partnerCode` is populated at swap creation on `develop` (see above). Pre-migration partner swaps
  without it are out of scope.
- For a partner swap, the provider's affiliate fee event equals `affiliateBps` worth (ShapeShift
  collects the full affiliate fee, incl. the partner's bps, then pays the partner out) — so
  splitting by `partnerBps / affiliateBps` is exact.
- `affiliateBps = shapeshiftBps + partnerBps`.
- EVM tx hashes may differ in case/prefix between sources → normalize (lowercase) before joining.
- swap-service is globally API-key authed (`ApiKeyGuard`, header `x-api-key`, env `SERVICE_API_KEY`);
  revenue-api needs `SERVICE_API_KEY` configured and must send the header. No new per-route auth.
- **swap-service work happens in a separate git worktree off `develop`** (the user is concurrently
  editing this repo for a payout script). revenue-dashboard work stays on
  `feat/partner-revenue-breakout` in the main checkout.

## Out of scope (YAGNI)

- Partner-facing auth / per-partner access control (internal-only now; API shape forward-compatible).
- Reconciling fee *counts* (only USD revenue/volume re-attributed).
- Historical backfill of `partnerCode` on pre-migration swaps.
- Pre-aggregated/materialized rollups in swap-service (on-demand + cache is sufficient).
