# Revenue API Architecture

## Overview

The Revenue API aggregates affiliate fee data from 12 DEX integrations and provides a unified view of ShapeShift's partner revenue.

## Key Design Decisions

### 1. Swap-Time Prices

**Decision**: USD values are what each fee was worth **when it was earned**, never today's market price. Past revenue therefore doesn't move with the market or between deploys.

**Implementation**:

- A provider's own USD is kept when it is priced at swap time: Relay, Chainflip, Bebop, 0x, NEAR Intents, ButterSwap cross-chain.
- Every other fee is priced by `enrichment.ts` from CoinGecko's hourly history at the fee's timestamp (`historicalPrices.ts`, via the ShapeShift proxy's `market_chart/range`).
- THORChain prices RUNE from Midgard's hourly RUNE history. MayaChain prices CACAO as CoinGecko BTC ÷ the BTC.BTC pool price. Maya's stablecoin pools aren't arbitraged to $1, and CoinGecko's CACAO feed is stale.
- A fee with no provider USD and no price within 6h stays unpriced. A gap is never filled with a current price.

---

### 2. Integration Architecture

Each DEX integration follows a standard pattern:

```typescript
// 1. Fetch fees from source (API, RPC, blockchain)
fetchFeesFromAPI(startTimestamp, endTimestamp): Promise<Fees[]>

// 2. Transform to standard format
transformFee(rawFee): Fees

// 3. Cache settled days (getCachedFees)
getCachedFees(service, chainId, start, end, fetchRange)

// 4. Price fees the provider left without swap-time USD
enrichFeesWithUsdPrices(fees)

// 5. Aggregate by date, service, asset
AffiliateRevenue.getAffiliateRevenue()
```

**Integration Types**:

- **API-based**: Bebop, Chainflip, Relay, THORChain, MayaChain, NEAR Intents, 0x
- **RPC-based**: AVNU, ButterSwap, Portals
- **Explorer-based**: CowSwap

---

### 3. Caching Strategy

**Two-tier caching**:

1. **Settled days**: complete UTC days, cached for 24h from when they were fetched (reads don't extend it). The daily refetch picks up late-settling swaps and heals a day cached during an outage.
2. **Recent**: days that haven't settled, refetched at most hourly.

A day is settled 15 minutes after it ends, or 26 hours after for THORChain and MayaChain: Midgard dates a streaming swap at its start but only adds the affiliate payout when it completes.

Historical price series are cached separately and don't expire, since past prices don't change.

**Cache Key Format**: `{service}:{chainId}:{YYYY-MM-DD}`

---

### 4. Error Handling

**Promise.allSettled Pattern**:

- All 12 integrations query in parallel
- One failure doesn't break others
- Failed providers tracked in `failedProviders` array
- Detailed logging for debugging

**Retry Logic**:

- 3 attempts with exponential backoff
- Retries: 429, 500, 502, 503, 504, network errors
- 30-second timeout per request

---

### 5. Asset ID Standards

Uses **CAIP (Chain Agnostic Improvement Proposals)** for asset identification:

**Native tokens**: `{chainId}/slip44:{coinType}`

- Example: `eip155:1/slip44:60` (ETH on Ethereum)

**ERC-20 tokens**: `{chainId}/erc20:{address}`

- Example: `eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7` (USDT)

**Cosmos tokens**: `{chainId}/slip44:{coinType}`

- Example: `cosmos:thorchain-1/slip44:931` (RUNE)

---

### 6. Fee Rate

**Global constant**: `FEE_RATE = 0.0055` (0.55% or 55 basis points)

Used to calculate implied trading volume:

```typescript
volume = feeAmount / 0.0055;
```

---

## Integration Details

| Integration  | Type     | Source              | Chains | Notes                          |
| ------------ | -------- | ------------------- | ------ | ------------------------------ |
| AVNU         | RPC      | Starknet events     | 1      | Transfer events to treasury    |
| Bebop        | API      | Trade history       | Multi  | Direct API with fee data       |
| ButterSwap   | RPC      | Contract balance    | 1      | Differential balance snapshots |
| Chainflip    | API      | GraphQL             | Multi  | USD values provided            |
| CowSwap      | Explorer | Internal txs        | 1      | Blockscout API, WETH only      |
| MayaChain    | API      | Affiliate fees      | 1      | ShapeShift-hosted API          |
| NEAR Intents | API      | Transaction history | Multi  | Cross-chain intents            |
| Portals      | RPC      | Alchemy event logs  | 10     | First ERC20 to treasury per tx |
| Relay        | API      | Bridge history      | Multi  | Cross-chain bridges            |
| THORChain    | API      | Affiliate fees      | 1      | ShapeShift-hosted API          |
| 0x           | API      | Trade analytics     | Multi  | Decimal amounts (not wei)      |

---

## Common Pitfalls for AI Agents

### ❌ "Price fees at the current market price"

**Wrong**: Repricing past fees at today's price, or filling a missing historical price with a current one
**Right**: Fees are valued at swap time; an unpriced fee stays unpriced

### ❌ "Zero results means integration is broken"

**Wrong**: Assuming zero fees = broken integration
**Right**: Many integrations have irregular activity (CowSwap, Portals, AVNU)

### ❌ "Revenue should match Mixpanel volume × 0.0055"

**Wrong**: Expecting exact match with Mixpanel
**Right**: Mixpanel may track different events or have gaps in cross-chain tracking

## Performance Characteristics

**Typical query (single day, cold cache)**:

- 12 parallel requests: 500-2000ms
- Cache hit: <50ms
- Cache miss rate: ~10-15% for historical dates

**Data freshness**:

- Current day: Real-time (no cache)
- Settled days: refetched daily (THORChain/MayaChain days wait 26h to settle)

**Rate limits**:

- Most APIs: No explicit limits (public or authenticated)
- CoinGecko (via the ShapeShift proxy): one `market_chart/range` call per coin per 89-day bucket, 4 in flight; cached after the first fetch
- Blockscout: Rate-limited per chain (cached to mitigate)

---

## Monitoring & Debugging

**Key metrics**:

- `failedProviders` - Array of integrations that threw errors
- Cache hit rate - Visible in logs: "Cache: X hits, Y misses"
- Response times - Per-integration logging

**Log format**:

```
[{integration}] Total: {count} fees in {duration}ms | Cache: {hits} hits, {misses} misses
```

**Common issues**:

1. RPC rate limits → Add delays or implement retry backoff
2. Explorer API downtime → Check specific chain explorers
3. Price lookup failures → Verify CoinGecko asset mappings
4. Timezone confusion → All timestamps are Unix seconds (UTC)

---

## Future Considerations

**New integrations**:

- Follow existing patterns in `/apps/revenue-api/src/affiliateRevenue/`
- Add to `providerNames` array in `index.ts`
- Update this documentation

**Scaling**:

- Current architecture handles 12 integrations efficiently
- Could optimize with better batching for 50+ integrations
- Consider worker queues for very high-frequency data
