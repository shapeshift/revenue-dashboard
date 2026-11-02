import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'

import './utils/http'
import './assetData/AssetDataService' // top-level await initializes the asset DB at boot
import { affiliateRevenueRoute } from './routes/affiliateRevenue'
import { partnerRevenueRoute } from './routes/partnerRevenue'
import { getDiagnostics, startDiagnostics } from './utils/diagnostics'

const app = new Hono()

// Enable CORS for Vercel frontend
app.use(cors())

// Health check endpoint
app.get('/health', c => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const debugToken = process.env['DEBUG_TOKEN']
if (debugToken) {
  app.get('/debug/inflight', bearerAuth({ token: debugToken }), c => c.json(getDiagnostics()))
}

// Affiliate revenue endpoint
app.route('/api/v1', affiliateRevenueRoute)

// Partner revenue endpoint
app.route('/api/v1', partnerRevenueRoute)

// 404 handler
app.notFound(c => {
  return c.json({ error: 'Not found' }, 404)
})

// Error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()

  console.error('[Server Error]:', err)
  return c.json({ error: 'Internal server error', message: err.message }, 500)
})

startDiagnostics()

const port = Number(process.env.PORT) || 4200

console.log(`🚀 Server starting on port ${port}`)
console.log(`   Health: /health`)
console.log(`   API: /api/v1/affiliate/revenue`)

Bun.serve({
  fetch: app.fetch,
  port,
  idleTimeout: 255, // Max allowed by Bun (4.25 minutes) for slow provider requests
})

console.log(`✅ Server listening on http://localhost:${port}`)
