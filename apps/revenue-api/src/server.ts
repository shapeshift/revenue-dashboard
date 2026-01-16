import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { affiliateRevenueRoute } from './routes/affiliateRevenue'

const app = new Hono()

// Enable CORS for Vercel frontend
app.use(cors())

// Health check endpoint
app.get('/health', c => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Affiliate revenue endpoint
app.route('/api/v1', affiliateRevenueRoute)

// 404 handler
app.notFound(c => {
  return c.json({ error: 'Not found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('[Server Error]:', err)
  return c.json({ error: 'Internal server error', message: err.message }, 500)
})

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
