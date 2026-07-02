# Partner Revenue Breakout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report ShapeShift-only revenue on the main dashboard (partner cuts peeled out) and add a separate Partners view breaking revenue down by partner, sourced from swap-service.

**Architecture:** swap-service exposes the affiliate registry and all partner swaps (enriched with the bps split). revenue-api fetches both, joins each partner swap to the matching provider fee event by txHash, and splits that event's USD by `partnerBps/affiliateBps` — leaving ShapeShift its share and moving the partner's share to a per-partner ledger. The main endpoint returns ShapeShift-net; a new endpoint returns the partner breakdown. The frontend gets a "Revenue | Partners" tab.

**Tech Stack:** NestJS + Prisma + Jest (swap-service, in a worktree); Hono + Bun + `bun:test` (revenue-api); React + @tanstack/react-query + Vite (frontend, no unit-test harness).

## Global Constraints

- **Two repos / two workspaces:**
  - swap-service work happens ONLY in the worktree `/home/kevin/github/shapeshift/microservices/.claude/worktrees/partner-revenue-breakout` (branch `feat/partner-revenue-breakout`, off `develop`). Run `yarn install` there before Phase A; verify baseline `cd apps/swap-service && yarn test` passes before writing code.
  - revenue-dashboard work happens in `/home/kevin/github/shapeshift/revenue-dashboard` on branch `feat/partner-revenue-breakout`.
- **swap-service auth:** every route is behind the global `ApiKeyGuard` (header `x-api-key`, env `SERVICE_API_KEY`). revenue-api must send this header; add `SERVICE_API_KEY` and `SWAP_SERVICE_URL` to revenue-api env.
- **Attribution math (exact):** `affiliateBps = shapeshiftBps + partnerBps`; a partner swap's provider fee event equals `affiliateBps` worth. Partner share of a fee event = `amountUsd * (partnerBps / affiliateBps)`. Never split when `affiliateBps <= 0`.
- **No double accounting:** every partner dollar leaves ShapeShift's number (real reduction for matched fees; synthetic negative fee for unmatched fallback) exactly once.
- **Fee counts unchanged:** settlement re-attributes USD/volume only, never `totalFeeCount`/`byServiceFeeCount`.
- **Partner labels:** `partnerCode` (always present on partner swaps post-migration). Partner view buckets by raw `swapperName`; ShapeShift subtraction uses the mapped dashboard `Service`.
- **Commit after every task.** Conventional commits, footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Checkpoint decisions to confirm with the user:** (a) matched settlement reduces net volume proportionally; (b) unmatched swaps peeled via synthetic negative fees + surfaced in `unreconciled`.

---

## Phase A — swap-service (worktree)

### Task A0: Worktree baseline

**Files:** none (setup only).

- [ ] **Step 1: Install deps in the worktree**

Run:
```bash
cd /home/kevin/github/shapeshift/microservices/.claude/worktrees/partner-revenue-breakout
yarn install
```
Expected: completes without error.

- [ ] **Step 2: Verify clean test baseline**

Run: `cd apps/swap-service && yarn test`
Expected: existing suites PASS (0 failures). If any fail, STOP and report.

---

### Task A1: `GET /v1/affiliate` — list all affiliates

**Files:**
- Modify: `apps/swap-service/src/affiliate/affiliate.service.ts` (add `listAffiliates`)
- Modify: `apps/swap-service/src/affiliate/affiliate.controller.ts` (add `@Get()` handler)
- Test: `apps/swap-service/src/affiliate/__tests__/list-affiliates.test.ts` (create)

**Interfaces:**
- Produces: `AffiliateService.listAffiliates(): Promise<{ partnerCode: string; bps: number; isActive: boolean }[]>` and route `GET /v1/affiliate`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/swap-service/src/affiliate/__tests__/list-affiliates.test.ts
import type { PrismaService } from '../../prisma/prisma.service'
import { AffiliateService } from '../affiliate.service'

const prismaWith = (findMany: jest.Mock): PrismaService =>
  ({ affiliate: { findMany }, swap: { findMany: jest.fn() } } as unknown as PrismaService)

describe('AffiliateService.listAffiliates', () => {
  it('maps affiliates to { partnerCode, bps, isActive }', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { partnerCode: 'alpha', bps: 60, isActive: true, walletAddress: '0xabc', receiveAddress: null },
      { partnerCode: 'beta', bps: 30, isActive: false, walletAddress: '0xdef', receiveAddress: null },
    ])
    const service = new AffiliateService(prismaWith(findMany))

    const result = await service.listAffiliates()

    expect(result).toEqual([
      { partnerCode: 'alpha', bps: 60, isActive: true },
      { partnerCode: 'beta', bps: 30, isActive: false },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/swap-service && yarn test src/affiliate/__tests__/list-affiliates.test.ts`
Expected: FAIL — `listAffiliates is not a function`.

- [ ] **Step 3: Implement `listAffiliates`**

Add to `AffiliateService` (in `affiliate.service.ts`):
```ts
async listAffiliates(): Promise<{ partnerCode: string; bps: number; isActive: boolean }[]> {
  const rows = await this.prisma.affiliate.findMany()
  return rows.map(({ partnerCode, bps, isActive }) => ({ partnerCode, bps, isActive }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/swap-service && yarn test src/affiliate/__tests__/list-affiliates.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the controller route**

In `affiliate.controller.ts`, add to `AffiliateController` **above** `@Get(':address')` (so the bare path is matched first):
```ts
@Get()
async list() {
  return this.affiliateService.listAffiliates()
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/swap-service/src/affiliate
git commit -m "feat(affiliate): add GET /v1/affiliate registry listing"
```

---

### Task A2: Extend `GET /v1/affiliate/swaps` — optional partnerCode + enriched rows

**Files:**
- Modify: `apps/swap-service/src/affiliate/types.ts` (`AffiliateSwapsQueryDto.partnerCode` optional)
- Modify: `apps/swap-service/src/affiliate/affiliate.service.ts` (`getAffiliateSwaps` signature + enrichment)
- Modify: `apps/swap-service/src/affiliate/affiliate.controller.ts` (pass optional partnerCode)
- Test: `apps/swap-service/src/affiliate/__tests__/affiliate-swaps.test.ts` (create)

**Interfaces:**
- Consumes: `toSwap`, `calculateFeeForSwap`, `getPartnerFeeRate` from `../../swaps/utils`; `swapCursorArgs`, `getNextCursor` from `../../utils/pagination`.
- Produces: `AffiliateService.getAffiliateSwaps(partnerCode: string | undefined, options): Promise<{ swaps: EnrichedSwap[]; nextCursor: string | null }>` where
  `EnrichedSwap = Swap & { affiliateBps: number | null; feeUsd: number | null; partnerFeeUsd: number | null; volumeUsd: number | null }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/swap-service/src/affiliate/__tests__/affiliate-swaps.test.ts
import type { PrismaService } from '../../prisma/prisma.service'
import { AffiliateService } from '../affiliate.service'

const swapRow = (over: Record<string, unknown> = {}) => ({
  swapId: 's1', partnerCode: 'alpha', swapperName: 'THORChain',
  sellTxHash: '0xAAA', buyTxHash: null, partnerBps: 50, shapeshiftBps: 10, affiliateBps: 0,
  status: 'SUCCESS', isAffiliateVerified: true,
  sellAsset: { precision: 8 }, buyAsset: {}, metadata: {},
  sellAmountCryptoBaseUnit: '100000000', sellAssetUsd: '10', actualAffiliateFeeAmountCryptoBaseUnit: null,
  affiliateFeeAssetId: null, affiliateAssetUsd: null,
  affiliateVerificationDetails: { hasAffiliate: true, affiliateBps: 60, verifiedSellAmountCryptoBaseUnit: '100000000' },
  createdAt: new Date('2026-06-01T12:00:00.000Z'), updatedAt: new Date('2026-06-01T12:00:00.000Z'),
  ...over,
})

const prismaWith = (findMany: jest.Mock): PrismaService =>
  ({ affiliate: { findUnique: jest.fn() }, swap: { findMany } } as unknown as PrismaService)

describe('AffiliateService.getAffiliateSwaps', () => {
  it('omitting partnerCode queries all partner swaps (partnerCode not null)', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const service = new AffiliateService(prismaWith(findMany))

    await service.getAffiliateSwaps(undefined, { limit: 50 })

    expect(findMany.mock.calls[0][0].where).toMatchObject({ partnerCode: { not: null } })
  })

  it('providing partnerCode filters to that partner', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const service = new AffiliateService(prismaWith(findMany))

    await service.getAffiliateSwaps('alpha', { limit: 50 })

    expect(findMany.mock.calls[0][0].where).toMatchObject({ partnerCode: 'alpha' })
  })

  it('enriches rows with affiliateBps, feeUsd, partnerFeeUsd, volumeUsd', async () => {
    const findMany = jest.fn().mockResolvedValue([swapRow()])
    const service = new AffiliateService(prismaWith(findMany))

    const { swaps } = await service.getAffiliateSwaps(undefined, { limit: 50 })

    // verifiedBps 60, sell 1.0 unit @ $10 => feeUsd = 10 * 60/10000 = 0.06
    // partner rate = 50/60 => partnerFeeUsd = 0.06 * (50/60) = 0.05
    expect(swaps[0].affiliateBps).toBe(60)
    expect(swaps[0].feeUsd).toBeCloseTo(0.06, 6)
    expect(swaps[0].partnerFeeUsd).toBeCloseTo(0.05, 6)
    expect(swaps[0].volumeUsd).toBeCloseTo(10, 6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/swap-service && yarn test src/affiliate/__tests__/affiliate-swaps.test.ts`
Expected: FAIL — current `getAffiliateSwaps` requires a `partnerCode` and returns un-enriched swaps.

- [ ] **Step 3: Make `partnerCode` optional in the DTO**

In `affiliate/types.ts`, change `AffiliateSwapsQueryDto.partnerCode` to optional (keep the format check only when present):
```ts
export class AffiliateSwapsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Matches(PARTNER_CODE_REGEX, { message: PARTNER_CODE_MESSAGE })
  partnerCode?: string

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date
}
```

- [ ] **Step 4: Implement optional filter + enrichment in the service**

In `affiliate.service.ts`, add the import and replace `getAffiliateSwaps`:
```ts
import { calculateFeeForSwap, getPartnerFeeRate, toSwap } from '../swaps/utils'
// (toSwap already imported; add calculateFeeForSwap, getPartnerFeeRate if missing)

async getAffiliateSwaps(
  partnerCode: string | undefined,
  options: { startDate?: Date; endDate?: Date; limit: number; cursor?: string },
) {
  const { startDate, endDate, limit, cursor } = options

  const items = await this.prisma.swap.findMany({
    ...swapCursorArgs(limit, cursor),
    where: {
      partnerCode: partnerCode ?? { not: null },
      ...(startDate || endDate
        ? { createdAt: { ...(startDate && { gte: startDate }), ...(endDate && { lte: endDate }) } }
        : {}),
    },
  })

  const swaps = items.map(item => {
    const swap = toSwap(item)
    const fee = calculateFeeForSwap(swap)
    const affiliateBps = fee?.verifiedBps ?? null
    const feeUsd = fee?.feeUsd ?? null
    const volumeUsd = fee?.volumeUsd ?? null
    const partnerFeeUsd =
      fee ? fee.feeUsd * getPartnerFeeRate(fee.verifiedBps, swap.partnerBps) : null
    return { ...swap, affiliateBps, feeUsd, partnerFeeUsd, volumeUsd }
  })

  return { swaps, nextCursor: getNextCursor(items, limit) }
}
```

- [ ] **Step 5: Update the controller to pass the optional code**

In `affiliate.controller.ts`:
```ts
@Get('swaps')
async getSwaps(@Query() query: AffiliateSwapsQueryDto) {
  return this.affiliateService.getAffiliateSwaps(query.partnerCode, query)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/swap-service && yarn test src/affiliate/__tests__/affiliate-swaps.test.ts`
Expected: PASS (all 3).

- [ ] **Step 7: Run the full affiliate suite (no regressions)**

Run: `cd apps/swap-service && yarn test src/affiliate`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/swap-service/src/affiliate
git commit -m "feat(affiliate): make affiliate/swaps partnerCode optional + enrich rows with fee split"
```

- [ ] **Step 9: Push branch (so revenue-api can integrate against it)**

```bash
git push -u origin feat/partner-revenue-breakout
```

---

## Phase B — revenue-api (revenue-dashboard repo)

All Phase B/C steps run from `/home/kevin/github/shapeshift/revenue-dashboard`.

### Task B1: `swapperName → Service` map

**Files:**
- Create: `apps/revenue-api/src/affiliateRevenue/partnerSettlement/swapperServiceMap.ts`
- Test: `apps/revenue-api/src/affiliateRevenue/partnerSettlement/swapperServiceMap.test.ts`

**Interfaces:**
- Produces: `mapSwapperNameToService(swapperName: string): Service | null`.

- [ ] **Step 1: Write the failing test**

```ts
// swapperServiceMap.test.ts
import { describe, expect, test } from 'bun:test'
import { mapSwapperNameToService } from './swapperServiceMap'

describe('mapSwapperNameToService', () => {
  test('maps known swappers to dashboard service ids', () => {
    expect(mapSwapperNameToService('THORChain')).toBe('thorchain')
    expect(mapSwapperNameToService('0x')).toBe('zrx')
    expect(mapSwapperNameToService('CoW Swap')).toBe('cowswap')
    expect(mapSwapperNameToService('Relay')).toBe('relay')
    expect(mapSwapperNameToService('Mayachain')).toBe('mayachain')
  })

  test('returns null for swappers the dashboard does not track', () => {
    expect(mapSwapperNameToService('Across')).toBeNull()
    expect(mapSwapperNameToService('ArbitrumBridge')).toBeNull()
    expect(mapSwapperNameToService('Unknown')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/revenue-api && bun test src/affiliateRevenue/partnerSettlement/swapperServiceMap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the map**

```ts
// swapperServiceMap.ts
import type { Service } from '../../types'

// Raw @shapeshiftoss/swapper SwapperName -> dashboard Service id.
// Swappers with no dashboard provider are intentionally absent (=> null).
const SWAPPER_TO_SERVICE: Record<string, Service> = {
  Avnu: 'avnu',
  Bebop: 'bebop',
  ButterSwap: 'butterswap',
  Chainflip: 'chainflip',
  'CoW Swap': 'cowswap',
  Mayachain: 'mayachain',
  NearIntents: 'nearintents',
  Portals: 'portals',
  Relay: 'relay',
  THORChain: 'thorchain',
  '0x': 'zrx',
}

export const mapSwapperNameToService = (swapperName: string): Service | null =>
  SWAPPER_TO_SERVICE[swapperName] ?? null
```

> NOTE for implementer: confirm the exact `SwapperName` string values against `@shapeshiftoss/swapper` in the swap DB (`select distinct "swapperName" from swaps`) before merging; adjust keys to match. `bobgateway` has no swapper counterpart (on-chain tracker) and is intentionally excluded.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/revenue-api && bun test src/affiliateRevenue/partnerSettlement/swapperServiceMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/revenue-api/src/affiliateRevenue/partnerSettlement/swapperServiceMap.ts apps/revenue-api/src/affiliateRevenue/partnerSettlement/swapperServiceMap.test.ts
git commit -m "feat(partnerSettlement): add swapperName to service map"
```

---

### Task B2: Settlement core (`buildSettlement`)

**Files:**
- Create: `apps/revenue-api/src/affiliateRevenue/partnerSettlement/types.ts`
- Create: `apps/revenue-api/src/affiliateRevenue/partnerSettlement/settle.ts`
- Test: `apps/revenue-api/src/affiliateRevenue/partnerSettlement/settle.test.ts`

**Interfaces:**
- Consumes: `Fees` from `../index`; `Service` from `../../types`; `getDateStartTimestamp` from `../cache`; `mapSwapperNameToService` from `./swapperServiceMap`.
- Produces:
  - Types `PartnerSwapRow`, `PartnerRevenue`, `SettlementResult` (in `types.ts`).
  - `buildSettlement(fees: Fees[], partnerSwaps: PartnerSwapRow[]): SettlementResult` where
    `SettlementResult = { netFees: Fees[]; byPartner: Record<string, PartnerRevenue>; partnerTotalUsd: number; unreconciled: { count: number; usd: number } }`.
- Also: adds optional `synthetic?: boolean` to `Fees` (Task B4 consumes it).

- [ ] **Step 1: Write the failing test**

```ts
// settle.test.ts
import { describe, expect, test } from 'bun:test'
import type { Fees } from '../index'
import { buildSettlement } from './settle'
import type { PartnerSwapRow } from './types'

const fee = (over: Partial<Fees>): Fees => ({
  amount: '0', amountUsd: '0', assetId: 'eip155:1/slip44:60', chainId: 'eip155:1',
  service: 'thorchain', timestamp: 1_780_000_000, txHash: '0xabc', ...over,
})

const swap = (over: Partial<PartnerSwapRow>): PartnerSwapRow => ({
  partnerCode: 'alpha', swapperName: 'THORChain', sellTxHash: '0xABC', buyTxHash: null,
  partnerBps: 50, affiliateBps: 60, feeUsd: 6, partnerFeeUsd: 5, volumeUsd: 1000,
  date: '2026-06-01', ...over,
})

describe('buildSettlement — matched fee event', () => {
  test('splits a matched fee by partnerBps/affiliateBps (provider USD is source of truth)', () => {
    const fees = [fee({ txHash: '0xABC', amountUsd: '6' })] // note case differs from swap.sellTxHash
    const res = buildSettlement(fees, [swap({})])

    // partner share = 6 * 50/60 = 5; shapeshift keeps 1
    expect(Number(res.netFees[0].amountUsd)).toBeCloseTo(1, 6)
    expect(res.byPartner.alpha.totalUsd).toBeCloseTo(5, 6)
    expect(res.byPartner.alpha.byService.THORChain).toBeCloseTo(5, 6)
    expect(res.byPartner.alpha.byDate['2026-06-01']).toBeCloseTo(5, 6)
    expect(res.byPartner.alpha.totalVolumeUsd).toBeCloseTo(1000, 6)
    expect(res.byPartner.alpha.swapCount).toBe(1)
    expect(res.partnerTotalUsd).toBeCloseTo(5, 6)
    expect(res.unreconciled).toEqual({ count: 0, usd: 0 })
    // conservation: net + partner == gross
    expect(Number(res.netFees[0].amountUsd) + res.partnerTotalUsd).toBeCloseTo(6, 6)
  })

  test('does not split when affiliateBps <= 0', () => {
    const fees = [fee({ txHash: '0xABC', amountUsd: '6' })]
    const res = buildSettlement(fees, [swap({ affiliateBps: 0 })])
    expect(Number(res.netFees[0].amountUsd)).toBeCloseTo(6, 6)
    expect(res.partnerTotalUsd).toBe(0)
  })
})

describe('buildSettlement — unmatched fallback', () => {
  test('emits a synthetic negative fee on the mapped service and flags unreconciled', () => {
    // chainflip fee event carries no txHash => cannot match
    const fees = [fee({ service: 'chainflip', txHash: '', amountUsd: '5' })]
    const s = swap({ swapperName: 'Chainflip', sellTxHash: null, buyTxHash: null, partnerFeeUsd: 4, feeUsd: 5 })
    const res = buildSettlement(fees, [s])

    const synthetic = res.netFees.find(f => f.synthetic)
    expect(synthetic).toBeDefined()
    expect(synthetic!.service).toBe('chainflip')
    expect(Number(synthetic!.amountUsd)).toBeCloseTo(-4, 6)
    expect(res.byPartner.alpha.totalUsd).toBeCloseTo(4, 6)
    expect(res.unreconciled).toEqual({ count: 1, usd: 4 })
  })

  test('unmapped swapper: no synthetic fee, still reported in byPartner', () => {
    const s = swap({ swapperName: 'Across', sellTxHash: null, buyTxHash: null, partnerFeeUsd: 3 })
    const res = buildSettlement([], [s])
    expect(res.netFees.find(f => f.synthetic)).toBeUndefined()
    expect(res.byPartner.alpha.totalUsd).toBeCloseTo(3, 6)
    expect(res.unreconciled).toEqual({ count: 1, usd: 3 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/revenue-api && bun test src/affiliateRevenue/partnerSettlement/settle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Define the types**

```ts
// types.ts
export type PartnerSwapRow = {
  partnerCode: string
  swapperName: string
  sellTxHash: string | null
  buyTxHash: string | null
  partnerBps: number
  affiliateBps: number | null
  feeUsd: number | null
  partnerFeeUsd: number | null
  volumeUsd: number | null
  date: string
}

export type PartnerRevenue = {
  partnerCode: string
  totalUsd: number
  totalVolumeUsd: number
  swapCount: number
  byService: Record<string, number> // raw swapperName -> usd
  byDate: Record<string, number> // date -> usd
}

export type SettlementResult = {
  netFees: import('../index').Fees[]
  byPartner: Record<string, PartnerRevenue>
  partnerTotalUsd: number
  unreconciled: { count: number; usd: number }
}
```

- [ ] **Step 4: Add `synthetic` to the `Fees` type**

In `apps/revenue-api/src/affiliateRevenue/index.ts`, extend the `Fees` type:
```ts
export type Fees = {
  amount: string
  amountUsd?: string
  originalUsdValue?: string
  assetId: string
  chainId: string
  service: Service
  timestamp: number
  txHash: string
  synthetic?: boolean // settlement-only negative adjustment; excluded from counts + asset breakdown
}
```

- [ ] **Step 5: Implement `buildSettlement`**

```ts
// settle.ts
import { getDateStartTimestamp } from '../cache'
import type { Fees } from '../index'
import { mapSwapperNameToService } from './swapperServiceMap'
import type { PartnerRevenue, PartnerSwapRow, SettlementResult } from './types'

const norm = (h: string | null | undefined): string | null => (h ? h.toLowerCase() : null)

export function buildSettlement(fees: Fees[], partnerSwaps: PartnerSwapRow[]): SettlementResult {
  const byTxHash = new Map<string, PartnerSwapRow>()
  for (const s of partnerSwaps) {
    for (const h of [norm(s.sellTxHash), norm(s.buyTxHash)]) {
      if (h) byTxHash.set(h, s)
    }
  }

  const byPartner: Record<string, PartnerRevenue> = {}
  const ensure = (code: string): PartnerRevenue =>
    (byPartner[code] ??= {
      partnerCode: code, totalUsd: 0, totalVolumeUsd: 0, swapCount: 0, byService: {}, byDate: {},
    })
  const credit = (s: PartnerSwapRow, usd: number) => {
    const p = ensure(s.partnerCode)
    p.totalUsd += usd
    p.swapCount += 1
    p.totalVolumeUsd += s.volumeUsd ?? 0
    p.byService[s.swapperName] = (p.byService[s.swapperName] ?? 0) + usd
    p.byDate[s.date] = (p.byDate[s.date] ?? 0) + usd
  }

  const matched = new Set<PartnerSwapRow>()
  const netFees: Fees[] = []

  for (const fee of fees) {
    const h = norm(fee.txHash)
    const s = h ? byTxHash.get(h) : undefined
    if (!s || !s.affiliateBps || s.affiliateBps <= 0) {
      netFees.push(fee)
      continue
    }
    matched.add(s)
    const amountUsd = parseFloat(fee.amountUsd || '0')
    const partnerShare = amountUsd * (s.partnerBps / s.affiliateBps)
    netFees.push({ ...fee, amountUsd: (amountUsd - partnerShare).toString() })
    credit(s, partnerShare)
  }

  let unrCount = 0
  let unrUsd = 0
  for (const s of partnerSwaps) {
    if (matched.has(s)) continue
    const partnerFeeUsd = s.partnerFeeUsd ?? 0
    const service = mapSwapperNameToService(s.swapperName)
    if (service && partnerFeeUsd > 0) {
      netFees.push({
        synthetic: true, amount: '0', amountUsd: (-partnerFeeUsd).toString(),
        assetId: '', chainId: '', service, timestamp: getDateStartTimestamp(s.date), txHash: '',
      })
    }
    credit(s, partnerFeeUsd)
    unrCount += 1
    unrUsd += partnerFeeUsd
  }

  const partnerTotalUsd = Object.values(byPartner).reduce((sum, p) => sum + p.totalUsd, 0)
  return { netFees, byPartner, partnerTotalUsd, unreconciled: { count: unrCount, usd: unrUsd } }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/revenue-api && bun test src/affiliateRevenue/partnerSettlement/settle.test.ts`
Expected: PASS (all 4).

- [ ] **Step 7: Commit**

```bash
git add apps/revenue-api/src/affiliateRevenue/partnerSettlement apps/revenue-api/src/affiliateRevenue/index.ts
git commit -m "feat(partnerSettlement): add buildSettlement core with matched split + unmatched fallback"
```

---

### Task B3: swap-service client (registry + partner swaps)

**Files:**
- Create: `apps/revenue-api/src/affiliateRevenue/partnerSettlement/swapServiceClient.ts`
- Test: `apps/revenue-api/src/affiliateRevenue/partnerSettlement/swapServiceClient.test.ts`

**Interfaces:**
- Produces:
  - `fetchPartnerSwaps(startDate: string, endDate: string): Promise<PartnerSwapRow[]>` (paginates until `nextCursor` is null; sends `x-api-key`).
  - `fetchAffiliateRegistry(): Promise<{ partnerCode: string; bps: number; isActive: boolean }[]>`.
- Consumes env: `SWAP_SERVICE_URL`, `SERVICE_API_KEY`.

- [ ] **Step 1: Write the failing test** (inject a fake fetch to avoid network)

```ts
// swapServiceClient.test.ts
import { describe, expect, test } from 'bun:test'
import { fetchPartnerSwaps } from './swapServiceClient'

const makeFetch = (pages: any[]) => {
  let i = 0
  return async () => ({ ok: true, json: async () => pages[i++] }) as unknown as Response
}

describe('fetchPartnerSwaps', () => {
  test('follows the cursor and maps enriched swap rows', async () => {
    const fakeFetch = makeFetch([
      {
        swaps: [{
          partnerCode: 'alpha', swapperName: 'THORChain', sellTxHash: '0xA', buyTxHash: null,
          partnerBps: 50, affiliateBps: 60, feeUsd: 6, partnerFeeUsd: 5, volumeUsd: 1000,
          createdAt: '2026-06-01T12:00:00.000Z',
        }],
        nextCursor: 'c1',
      },
      { swaps: [], nextCursor: null },
    ])

    const rows = await fetchPartnerSwaps('2026-06-01', '2026-06-02', { fetchImpl: fakeFetch })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ partnerCode: 'alpha', swapperName: 'THORChain', date: '2026-06-01' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/revenue-api && bun test src/affiliateRevenue/partnerSettlement/swapServiceClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

```ts
// swapServiceClient.ts
import type { PartnerSwapRow } from './types'

const BASE = process.env.SWAP_SERVICE_URL ?? 'http://localhost:3001'
const API_KEY = process.env.SERVICE_API_KEY ?? ''

type Opts = { fetchImpl?: typeof fetch }

const toDate = (iso: string): string => iso.slice(0, 10)

export async function fetchPartnerSwaps(
  startDate: string,
  endDate: string,
  opts: Opts = {},
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
    const body = (await res.json()) as { swaps: any[]; nextCursor: string | null }

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

export async function fetchAffiliateRegistry(
  opts: Opts = {},
): Promise<{ partnerCode: string; bps: number; isActive: boolean }[]> {
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(new URL('/v1/affiliate', BASE).toString(), { headers: { 'x-api-key': API_KEY } })
  if (!res.ok) throw new Error(`swap-service /v1/affiliate ${res.status}`)
  return (await res.json()) as { partnerCode: string; bps: number; isActive: boolean }[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/revenue-api && bun test src/affiliateRevenue/partnerSettlement/swapServiceClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/revenue-api/src/affiliateRevenue/partnerSettlement/swapServiceClient.ts apps/revenue-api/src/affiliateRevenue/partnerSettlement/swapServiceClient.test.ts
git commit -m "feat(partnerSettlement): add swap-service client for registry + partner swaps"
```

---

### Task B4: Wire settlement into `getAffiliateRevenue` (main endpoint = net)

**Files:**
- Modify: `apps/revenue-api/src/affiliateRevenue/index.ts`
- Modify: `apps/revenue-api/src/types.ts` (add `unreconciled` to `AffiliateRevenueResponse`)

**Interfaces:**
- Consumes: `buildSettlement` (B2), `fetchPartnerSwaps` (B3).
- Produces: `getAffiliateRevenue` returns net aggregates + `unreconciled`; new private `collectFees` + `settle` helpers reused by Task B5.

- [ ] **Step 1: Extract fee collection into `collectFees`**

In `index.ts`, refactor the `Promise.allSettled([...])` block of `getAffiliateRevenue` into a private method (no behavior change):
```ts
private async collectFees(
  startTimestamp: number,
  endTimestamp: number,
): Promise<{ fees: Fees[]; failedProviders: Service[] }> {
  const fees: Fees[] = []
  const failedProviders: Service[] = []
  const results = await Promise.allSettled([ /* ...existing provider calls, unchanged... */ ])
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') fees.push(...result.value)
    else {
      const provider = providerNames[index]
      failedProviders.push(provider)
      console.error(`[AffiliateRevenue] ${provider} failed: ${formatError(result.reason)}`)
    }
  })
  return { fees, failedProviders }
}
```

- [ ] **Step 2: Add a shared `settle` helper**

```ts
private async settle(
  fees: Fees[],
  startTimestamp: number,
  endTimestamp: number,
): Promise<SettlementResult> {
  const startDate = timestampToDate(startTimestamp)
  const endDate = timestampToDate(endTimestamp)
  try {
    const partnerSwaps = await fetchPartnerSwaps(startDate, endDate)
    return buildSettlement(fees, partnerSwaps)
  } catch (error) {
    console.error(`[AffiliateRevenue] partner settlement failed: ${formatError(error)}`)
    // graceful: no peeling, empty partner ledger
    return { netFees: fees, byPartner: {}, partnerTotalUsd: 0, unreconciled: { count: 0, usd: 0 } }
  }
}
```
Add imports at top of `index.ts`:
```ts
import { buildSettlement } from './partnerSettlement/settle'
import { fetchPartnerSwaps } from './partnerSettlement/swapServiceClient'
import type { SettlementResult } from './partnerSettlement/types'
```

- [ ] **Step 3: Aggregate `netFees` and guard synthetic rows**

Replace the body of `getAffiliateRevenue` so it aggregates `settlement.netFees` instead of `fees`, and skip synthetic fees for counts + asset breakdown:
```ts
async getAffiliateRevenue(startTimestamp: number, endTimestamp: number): Promise<AffiliateRevenueResponse> {
  assetDataService.resetMissLog()
  const { fees, failedProviders } = await this.collectFees(startTimestamp, endTimestamp)
  const settlement = await this.settle(fees, startTimestamp, endTimestamp)

  const byDate: AffiliateRevenueResponse['byDate'] = {}
  const byAsset: Record<string, AssetRevenue> = {}

  for (const fee of settlement.netFees) {
    const date = timestampToDate(fee.timestamp)
    const amountUsd = parseFloat(fee.amountUsd || '0')
    // ...existing byDate init + totals/service USD + volume aggregation (UNCHANGED)...

    if (!fee.synthetic) {
      byDate[date].totalFeeCount += 1
      byDate[date].byServiceFeeCount[fee.service] += 1
    }

    if (!fee.synthetic) {
      const asset = await assetDataService.getAsset(fee.assetId)
      // ...existing per-asset aggregation (daily + global), UNCHANGED...
    }
  }
  // ...existing byService/totals reduction + return, plus:
  return { /* ...existing fields..., */ unreconciled: settlement.unreconciled }
}
```

> Implementer note: only the count increments and the asset block move under `if (!fee.synthetic)`. The `totalUsd`/`byService`/`byServiceVolume` math stays applied to every fee (synthetic negatives must reduce those). Keep `totalFeeCount` from summing daily counts as today.

- [ ] **Step 4: Add `unreconciled` to the response type**

In `apps/revenue-api/src/types.ts`, add to `AffiliateRevenueResponse`:
```ts
  unreconciled: { count: number; usd: number }
```

- [ ] **Step 5: Type-check + run all revenue-api tests**

Run: `cd apps/revenue-api && bunx tsc --noEmit && bun test`
Expected: PASS (no type errors; existing + new suites green).

- [ ] **Step 6: Commit**

```bash
git add apps/revenue-api/src/affiliateRevenue/index.ts apps/revenue-api/src/types.ts
git commit -m "feat(affiliateRevenue): settle partner cuts out of main revenue (net) with graceful fallback"
```

---

### Task B5: Partner revenue endpoint

**Files:**
- Create: `apps/revenue-api/src/routes/partnerRevenue.ts`
- Modify: `apps/revenue-api/src/affiliateRevenue/index.ts` (add `getPartnerRevenue`)
- Modify: `apps/revenue-api/src/server.ts` (mount route)
- Modify: `apps/revenue-api/src/types.ts` (add `PartnerRevenueResponse`)

**Interfaces:**
- Produces: `AffiliateRevenue.getPartnerRevenue(startTimestamp, endTimestamp): Promise<PartnerRevenueResponse>` and `GET /api/v1/partner/revenue`.

- [ ] **Step 1: Add `getPartnerRevenue`**

In `index.ts`:
```ts
async getPartnerRevenue(startTimestamp: number, endTimestamp: number): Promise<PartnerRevenueResponse> {
  const { fees } = await this.collectFees(startTimestamp, endTimestamp)
  const settlement = await this.settle(fees, startTimestamp, endTimestamp)
  let affiliates: PartnerRevenueResponse['affiliates'] = []
  try {
    affiliates = await fetchAffiliateRegistry()
  } catch (error) {
    console.error(`[PartnerRevenue] registry fetch failed: ${formatError(error)}`)
  }
  return {
    byPartner: settlement.byPartner,
    partnerTotalUsd: settlement.partnerTotalUsd,
    unreconciled: settlement.unreconciled,
    affiliates,
  }
}
```
Add import: `import { fetchAffiliateRegistry } from './partnerSettlement/swapServiceClient'` and `import type { PartnerRevenueResponse } from '../types'`.

- [ ] **Step 2: Add response type**

In `apps/revenue-api/src/types.ts`:
```ts
export interface PartnerRevenueResponse {
  byPartner: Record<string, import('./affiliateRevenue/partnerSettlement/types').PartnerRevenue>
  partnerTotalUsd: number
  unreconciled: { count: number; usd: number }
  affiliates: { partnerCode: string; bps: number; isActive: boolean }[]
}
```

- [ ] **Step 3: Create the route (mirror `routes/affiliateRevenue.ts` validation)**

```ts
// routes/partnerRevenue.ts
import { Hono } from 'hono'
import { AffiliateRevenue } from '../affiliateRevenue'
import type { PartnerRevenueResponse } from '../types'

const partnerRevenueRoute = new Hono()
const affiliateRevenue = new AffiliateRevenue()

partnerRevenueRoute.get('/partner/revenue', async c => {
  try {
    const startDate = c.req.query('startDate')
    const endDate = c.req.query('endDate')
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!startDate || !dateRegex.test(startDate)) return c.json({ error: 'Invalid startDate format, expected YYYY-MM-DD' }, 400)
    if (!endDate || !dateRegex.test(endDate)) return c.json({ error: 'Invalid endDate format, expected YYYY-MM-DD' }, 400)
    const startTimestamp = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000)
    const endTimestamp = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000)
    if (isNaN(startTimestamp) || isNaN(endTimestamp)) return c.json({ error: 'Invalid date value' }, 400)

    const result: PartnerRevenueResponse = await affiliateRevenue.getPartnerRevenue(startTimestamp, endTimestamp)
    return c.json(result)
  } catch (error) {
    console.error('[Partner Revenue Error]:', error)
    return c.json({ error: 'Failed to fetch partner revenue', message: error instanceof Error ? error.message : String(error) }, 500)
  }
})

export { partnerRevenueRoute }
```

- [ ] **Step 4: Mount the route**

In `server.ts`, mirror the existing affiliate route mount:
```ts
import { partnerRevenueRoute } from './routes/partnerRevenue'
// ...where affiliateRevenueRoute is mounted (same base, e.g. app.route('/api/v1', ...)):
app.route('/api/v1', partnerRevenueRoute)
```
> Implementer: match the exact mount pattern already used for `affiliateRevenueRoute` in `server.ts`.

- [ ] **Step 5: Type-check + tests**

Run: `cd apps/revenue-api && bunx tsc --noEmit && bun test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/revenue-api/src
git commit -m "feat(revenue-api): add GET /api/v1/partner/revenue endpoint"
```

---

## Phase C — frontend (no unit-test harness; verify via type-check + manual run)

### Task C1: Types, api client, hook for partner revenue

**Files:**
- Modify: `apps/revenue-dashboard/src/types/index.ts`
- Create: `apps/revenue-dashboard/src/api/partnerRevenue.ts`
- Create: `apps/revenue-dashboard/src/hooks/usePartnerRevenue.ts`

- [ ] **Step 1: Add types**

In `apps/revenue-dashboard/src/types/index.ts`:
```ts
export type PartnerRevenue = {
  partnerCode: string
  totalUsd: number
  totalVolumeUsd: number
  swapCount: number
  byService: Record<string, number>
  byDate: Record<string, number>
}

export type PartnerRevenueResponse = {
  byPartner: Record<string, PartnerRevenue>
  partnerTotalUsd: number
  unreconciled: { count: number; usd: number }
  affiliates: { partnerCode: string; bps: number; isActive: boolean }[]
}
```
Also add `unreconciled: { count: number; usd: number }` to the existing `AffiliateRevenueResponse` type in the same file.

- [ ] **Step 2: Add the api client (mirror `api/affiliateRevenue.ts`)**

```ts
// api/partnerRevenue.ts
import type { DateRange, PartnerRevenueResponse } from '../types'

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || 'https://api.proxy.shapeshift.com'

export async function fetchPartnerRevenue(dateRange: DateRange): Promise<PartnerRevenueResponse> {
  const url = new URL('/api/v1/partner/revenue', API_BASE_URL)
  url.searchParams.set('startDate', dateRange.startDate)
  url.searchParams.set('endDate', dateRange.endDate)
  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  return (await response.json()) as PartnerRevenueResponse
}
```

- [ ] **Step 3: Add the hook (mirror `useAffiliateRevenue`)**

```ts
// hooks/usePartnerRevenue.ts
import { useQuery } from '@tanstack/react-query'
import { fetchPartnerRevenue } from '../api/partnerRevenue'
import type { DateRange } from '../types'

export function usePartnerRevenue(dateRange: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: ['partnerRevenue', dateRange.startDate, dateRange.endDate],
    queryFn: () => fetchPartnerRevenue(dateRange),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  })
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/revenue-dashboard && yarn type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/revenue-dashboard/src/types/index.ts apps/revenue-dashboard/src/api/partnerRevenue.ts apps/revenue-dashboard/src/hooks/usePartnerRevenue.ts
git commit -m "feat(dashboard): add partner revenue types, api client, and hook"
```

---

### Task C2: PartnerBreakdown component + tab nav

**Files:**
- Create: `apps/revenue-dashboard/src/components/PartnerBreakdown.tsx`
- Modify: `apps/revenue-dashboard/src/App.tsx`

- [ ] **Step 1: Create `PartnerBreakdown`** (styled after `ServiceBreakdown.tsx`)

```tsx
// components/PartnerBreakdown.tsx
import { useMemo, useState } from 'react'
import type { PartnerRevenueResponse } from '../types'

type SortKey = 'totalUsd' | 'totalVolumeUsd' | 'swapCount'

export function PartnerBreakdown({ data, isLoading }: { data?: PartnerRevenueResponse; isLoading: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>('totalUsd')

  const rows = useMemo(() => {
    if (!data) return []
    return Object.values(data.byPartner).sort((a, b) => b[sortKey] - a[sortKey])
  }, [data, sortKey])

  if (isLoading) return <div className="text-zinc-400">Loading partners…</div>
  if (!data || rows.length === 0) return <div className="text-zinc-400">No partner revenue in this range.</div>

  return (
    <div className="rounded-lg bg-zinc-800 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Revenue by Partner</h2>
        <div className="text-sm text-zinc-400">
          Partner payouts: ${data.partnerTotalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          {data.unreconciled.count > 0 && (
            <span className="ml-2 text-amber-400">
              ({data.unreconciled.count} unreconciled, ${data.unreconciled.usd.toFixed(2)})
            </span>
          )}
        </div>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-zinc-400">
          <tr>
            <th className="py-2">Partner</th>
            <th className="cursor-pointer py-2" onClick={() => setSortKey('totalUsd')}>Revenue</th>
            <th className="cursor-pointer py-2" onClick={() => setSortKey('totalVolumeUsd')}>Volume</th>
            <th className="cursor-pointer py-2" onClick={() => setSortKey('swapCount')}>Swaps</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.partnerCode} className="border-t border-zinc-700">
              <td className="py-2 font-medium">{p.partnerCode}</td>
              <td className="py-2">${p.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td className="py-2">${p.totalVolumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td className="py-2">{p.swapCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Add tab state + Partners view to `App.tsx`**

In `App.tsx`: add `const [tab, setTab] = useState<'revenue' | 'partners'>('revenue')`, call `usePartnerRevenue(dateRange, tab === 'partners')`, render a two-button nav under the header, and switch the body:
```tsx
<div className="mb-6 flex gap-2">
  <button
    className={`rounded px-3 py-1 ${tab === 'revenue' ? 'bg-zinc-700' : 'bg-zinc-800'}`}
    onClick={() => setTab('revenue')}
  >Revenue</button>
  <button
    className={`rounded px-3 py-1 ${tab === 'partners' ? 'bg-zinc-700' : 'bg-zinc-800'}`}
    onClick={() => setTab('partners')}
  >Partners</button>
</div>
{tab === 'revenue' ? (
  <div className="space-y-6">{/* existing Revenue view, unchanged */}</div>
) : (
  <PartnerBreakdown data={partnerData} isLoading={partnerLoading} />
)}
```
Update the sub-heading copy to note the Revenue view is ShapeShift-net.

- [ ] **Step 3: Type-check**

Run: `cd apps/revenue-dashboard && yarn type-check`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Use the `/run` skill (or `yarn dev` in `apps/revenue-dashboard` with the revenue-api running): confirm the Revenue tab renders net numbers and the Partners tab lists partners with revenue/volume/swaps and a partner-payouts total. Confirm `unreconciled` shows when nonzero.

- [ ] **Step 5: Commit**

```bash
git add apps/revenue-dashboard/src/components/PartnerBreakdown.tsx apps/revenue-dashboard/src/App.tsx
git commit -m "feat(dashboard): add Partners tab with revenue-by-partner breakdown"
```

---

## Self-Review Notes (coverage vs spec)

- Main endpoint ShapeShift-net → B4. Separate partner endpoint/page → B5, C2. Per-swap txHash settlement → B2. swap-service registry + optional-partnerCode swaps → A1, A2. `swapperName → service` map → B1. Graceful degradation → B4/B5 try-catch. Global api-key auth → B3 header + env (Global Constraints). Worktree isolation → A0 + Global Constraints. No-double-accounting conservation → asserted in B2 tests.
- **Open items surfaced for checkpoints:** exact `SwapperName` string values (B1 note); `server.ts` mount pattern (B5 note); net-volume + synthetic-fallback decisions (Global Constraints).
