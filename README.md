# ShapeShift Revenue Dashboard

A monorepo containing a dashboard for tracking affiliate revenue from ShapeShift swap providers, with a standalone API backend and React frontend.

## Architecture

This is a **bun monorepo** with two apps:

- **Backend API** (`apps/revenue-api/`) - Hono server deployed to Railway
- **Frontend Dashboard** (`apps/revenue-dashboard/`) - React SPA deployed to Vercel

```
shapeshift-revenue-dashboard/
├── apps/
│   ├── revenue-api/         # Backend (Railway)
│   │   ├── src/
│   │   │   ├── affiliateRevenue/  # 9 provider integrations
│   │   │   ├── routes/            # API routes
│   │   │   ├── types.ts           # Shared types
│   │   │   └── server.ts          # Hono server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsup.config.ts
│   │
│   └── revenue-dashboard/   # Frontend (Vercel)
│       ├── src/
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
│
├── package.json             # Root workspace config
├── railway.json             # Railway deployment config
└── vercel.json              # Vercel deployment config
```

## Features

- Total revenue display across all providers
- Daily revenue time-series chart
- Revenue breakdown by service (pie chart + table)
- Date range picker with presets (7, 30, 90 days)
- Dark theme
- 9 DEX provider integrations:
  - Bebop
  - ButterSwap
  - Chainflip
  - MayaChain
  - NEAR Intents
  - Portals
  - Relay
  - THORChain
  - 0x (ZRX)

## Tech Stack

### Backend
- Bun runtime
- Hono (HTTP framework)
- TypeScript
- Viem (Ethereum interactions)
- LRU Cache (90-day TTL)

### Frontend
- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- Recharts
- TanStack Query (React Query)

## Local Development

### Prerequisites
- Bun >= 1.3.2

### Setup

```bash
# Install dependencies
bun install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your API keys
# Required: BEBOP_API_KEY, NEAR_INTENTS_API_KEY, ZRX_API_KEY
```

### Running Locally

```bash
# Start both backend and frontend in parallel
bun dev

# Or run individually:
bun dev:backend   # Backend on http://localhost:4200
bun dev:frontend  # Frontend on http://localhost:5173
```

The frontend will be available at http://localhost:5173 and will connect to the backend at http://localhost:4200.

### Building

```bash
# Type-check all workspaces
bun type-check

# Lint all code
bun lint
bun lint:fix

# Build everything
bun build

# Build individually
bun build:backend   # Outputs to apps/revenue-api/dist/
bun build:frontend  # Outputs to apps/revenue-dashboard/dist/
```

## Environment Variables

### Backend (Railway)

| Variable | Description | Required |
|----------|-------------|----------|
| `BEBOP_API_KEY` | API key for Bebop trades data | Yes |
| `NEAR_INTENTS_API_KEY` | API key for NEAR Intents explorer | Yes |
| `ZRX_API_KEY` | API key for 0x Trade Analytics | Yes |
| `PORT` | Server port | No (default: 4200) |

### Frontend (Vercel)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API URL | `https://api.proxy.shapeshift.com` |
| `VITE_USE_MOCK_DATA` | Use mock data instead of API | `false` |

For local development, create `apps/revenue-dashboard/.env.local`:
```bash
VITE_API_BASE_URL=http://localhost:4200
```

For production, create `apps/revenue-dashboard/.env.production`:
```bash
VITE_API_BASE_URL=https://your-railway-app.railway.app
```

## API Reference

### GET /api/v1/affiliate/revenue

Query parameters:
- `startDate` (required): Start date in YYYY-MM-DD format
- `endDate` (required): End date in YYYY-MM-DD format

Response format:
```json
{
  "totalUsd": 4667.55,
  "byService": {
    "thorchain": 1807.65,
    "zrx": 965.17,
    "mayachain": 234.56,
    "chainflip": 456.78,
    "bebop": 123.45,
    "portals": 345.67,
    "relay": 234.56,
    "butterswap": 123.45,
    "nearintents": 376.26
  },
  "byDate": {
    "2025-11-22": {
      "totalUsd": 123.45,
      "byService": {
        "thorchain": 34.56,
        "mayachain": 12.34,
        "chainflip": 23.45,
        "zrx": 15.67,
        "bebop": 8.90,
        "portals": 10.11,
        "relay": 7.89,
        "butterswap": 3.45,
        "nearintents": 7.08
      }
    }
  },
  "failedProviders": []
}
```

### GET /health

Health check endpoint for Railway.

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-12-29T12:00:00.000Z"
}
```

## Deployment

### Backend (Railway)

1. Push this repo to GitHub
2. Create a new project in [Railway](https://railway.app)
3. Select "Deploy from GitHub" and choose this repository
4. Railway auto-detects `railway.json` configuration
5. Add environment variables in Railway dashboard:
   - `BEBOP_API_KEY`
   - `NEAR_INTENTS_API_KEY`
   - `ZRX_API_KEY`
6. Deploy

Railway configuration (in `railway.json`):
- Build command: `bun install && bun build:backend`
- Start command: `bun apps/revenue-api/dist/server.js`
- Health check: `/health`

### Frontend (Vercel)

1. Push this repo to GitHub
2. Import the repo in [Vercel](https://vercel.com/new)
3. Vercel auto-detects `vercel.json` configuration
4. Add environment variable:
   - `VITE_API_BASE_URL` = `https://your-railway-app.railway.app`
5. Deploy

Vercel configuration (in `vercel.json`):
- Build command: `bun build:frontend`
- Output directory: `apps/revenue-dashboard/dist`
- Framework: Vite
- SPA rewrites configured

## Project Structure

### Backend (`apps/revenue-api/`)

- `src/server.ts` - Hono server entry point with CORS and error handling
- `src/routes/affiliateRevenue.ts` - Main API route with date validation
- `src/types.ts` - TypeScript types for API responses
- `src/affiliateRevenue/` - Revenue tracking implementations:
  - `bebop/` - Bebop trades integration
  - `butterswap/` - ButterSwap integration
  - `chainflip/` - Chainflip integration
  - `mayachain/` - MayaChain integration
  - `nearIntents/` - NEAR Intents integration
  - `portals/` - Portals integration
  - `relay/` - Relay integration
  - `thorchain/` - THORChain integration
  - `zrx/` - 0x integration
  - `cache.ts` - LRU caching layer
  - `constants.ts` - Shared constants
  - `index.ts` - Main AffiliateRevenue class

### Frontend (`apps/revenue-dashboard/`)

- `src/App.tsx` - Main application component
- `src/components/` - React components
  - `DateRangeSelector.tsx` - Date picker with presets
  - `RevenueCard.tsx` - Total revenue display
  - `RevenueByService.tsx` - Service breakdown table
  - `RevenueTimeSeries.tsx` - Daily revenue chart
  - `ServicePieChart.tsx` - Service distribution chart
- `src/api/` - API client and mock data
- `src/types.ts` - TypeScript types

## License

MIT
