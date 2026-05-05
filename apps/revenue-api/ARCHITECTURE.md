# Revenue API Architecture

## Overview

The Revenue API aggregates affiliate fee data from 12 DEX integrations and provides a unified view of ShapeShift's partner revenue.

## Key Design Decisions

### 1. Current Prices vs Historical Prices

**Decision**: The API uses **current market prices** when calculating USD values, not historical prices.

**Rationale**:

- Shows "today's value" of earned revenue
- Provides meaningful insight into current portfolio value
- Enables real-time performance tracking
- Makes time-period comparisons more relevant

**Example**:

```
Jan 1: Earned 1 ETH when ETH = $2,000
Today: ETH = $3,000

Dashboard displays: $3,000 (current value) ✓
NOT: $2,000 (historical value) ✗
```

**Implementation**: `enrichment.ts` preserves original values in `originalUsdValue` but overwrites `amountUsd` with current prices.

**Impact**: Historical revenue values will fluctuate with market prices. This is **intentional**, not a bug.

---

### 2. Integration Architecture

Each DEX integration follows a standard pattern:

```typescript
// 1. Fetch fees from source (API, RPC, blockchain)
fetchFeesFromAPI(startTimestamp, endTimestamp): Promise<Fees[]>

// 2. Transform to standard format
transformFee(rawFee): Fees

// 3. Cache historical data (>24h old)
tryGetCachedFees() / saveCachedFees()

// 4. Enrich with current USD prices
enrichFeesWithUsdPrices(fees)

// 5. Aggregate by date, service, asset
AffiliateRevenue.getAffiliateRevenue()
```

**Integration Types**:

- **API-based**: Bebop, Chainflip, Relay, THORChain, MayaChain, NEAR Intents, 0x
- **RPC-based**: AVNU, ButterSwap, Jupiter
- **Explorer-based**: CowSwap, Portals

---

### 3. Caching Strategy

**Two-tier caching**:

1. **Historical (cacheable)**: Complete days before today (24h TTL)
2. **Recent**: Current day - always fetched fresh

**Benefits**:

- Reduces API/RPC load by ~85-90%
- Ensures current prices for historical data
- Fast responses for repeated queries

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
| Jupiter      | RPC      | Solana txs          | 1      | Referral PDA balances          |
| MayaChain    | API      | Affiliate fees      | 1      | ShapeShift-hosted API          |
| NEAR Intents | API      | Transaction history | Multi  | Cross-chain intents            |
| Portals      | Explorer | Event logs          | 8      | Multi-chain aggregator         |
| Relay        | API      | Bridge history      | Multi  | Cross-chain bridges            |
| THORChain    | API      | Affiliate fees      | 1      | ShapeShift-hosted API          |
| 0x           | API      | Trade analytics     | Multi  | Decimal amounts (not wei)      |

---

## Common Pitfalls for AI Agents

### ❌ "Price enrichment is a bug"

**Wrong**: Thinking current prices should be historical prices
**Right**: Current prices are intentional for "today's value" reporting

### ❌ "Zero results means integration is broken"

**Wrong**: Assuming zero fees = broken integration
**Right**: Many integrations have irregular activity (CowSwap, Portals, AVNU)

### ❌ "Revenue should match Mixpanel volume × 0.0055"

**Wrong**: Expecting exact match with Mixpanel
**Right**: Mixpanel may track different events or have gaps in cross-chain tracking

### ❌ "Must use historical prices for accuracy"

**Wrong**: Replacing enrichment with historical price lookups
**Right**: Preserving current price strategy, using `originalUsdValue` if needed

---

## Performance Characteristics

**Typical query (single day, cold cache)**:

- 12 parallel requests: 500-2000ms
- Cache hit: <50ms
- Cache miss rate: ~10-15% for historical dates

**Data freshness**:

- Current day: Real-time (no cache)
- Historical days: Up to 24h stale (price updates)

**Rate limits**:

- Most APIs: No explicit limits (public or authenticated)
- CoinGecko: 50 calls/min (batch pricing reduces impact)
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

**Historical prices**:

- Could add toggle: "Show current value" vs "Show earned value"
- Would require historical price database or API (CoinGecko Pro)
- Keep `originalUsdValue` preservation for backward compatibility

**New integrations**:

- Follow existing patterns in `/apps/revenue-api/src/affiliateRevenue/`
- Add to `providerNames` array in `index.ts`
- Update this documentation

**Scaling**:

- Current architecture handles 12 integrations efficiently
- Could optimize with better batching for 50+ integrations
- Consider worker queues for very high-frequency data
