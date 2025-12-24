# ShapeShift Revenue Dashboard

A simple dashboard displaying affiliate revenue from ShapeShift swap providers.

## Features

- Total revenue display
- Daily revenue time-series chart
- Revenue breakdown by service (pie chart + table)
- Date range picker with presets (7, 30, 90 days)
- Dark theme

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- Recharts
- TanStack Query (React Query)

## Local Development

```bash
# Install dependencies
bun install

# Start development server
bun dev
```

The app will be available at http://localhost:5173

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Base URL for the affiliate revenue API | `https://api.proxy.shapeshift.com` |

## API Reference

The dashboard fetches data from:

```
GET /api/v1/affiliate/revenue?startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}
```

Response format:
```json
{
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
        "cowswap": 5.67,
        "relay": 7.89,
        "butterswap": 3.45,
        "nearintents": 1.41
      }
    },
    "2025-11-23": {
      "totalUsd": 234.56,
      "byService": {
        "thorchain": 56.78,
        "mayachain": 23.45,
        "chainflip": 34.56,
        "zrx": 28.90,
        "bebop": 12.34,
        "portals": 18.23,
        "cowswap": 11.22,
        "relay": 15.67,
        "butterswap": 6.78,
        "nearintents": 26.63
      }
    }
  },
  "failedProviders": []
}
```

## Deployment (Vercel)

1. Push this repo to GitHub
2. Import the repo in [Vercel](https://vercel.com/new)
3. Set the `VITE_API_BASE_URL` environment variable if needed
4. Deploy

Vercel will auto-detect Vite and configure the build settings automatically.

## Build

```bash
# Production build
bun run build

# Preview production build
bun run preview
```
