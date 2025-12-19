# ShapeShift Revenue Dashboard

A simple dashboard displaying affiliate revenue from ShapeShift swap providers.

## Features

- Total revenue display
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
GET /api/v1/affiliate/revenue?startTimestamp={unix}&endTimestamp={unix}
```

Response format:
```json
{
  "totalUsd": 12345.67,
  "byService": {
    "thorchain": 3456.78,
    "mayachain": 456.78,
    "chainflip": 567.89,
    "zrx": 1234.56,
    "bebop": 2345.67,
    "portals": 678.90,
    "cowswap": 123.45,
    "relay": 234.56,
    "butterswap": 100.00,
    "nearintents": 50.00
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
