import { Hono } from 'hono'

import { AffiliateRevenue } from '../affiliateRevenue'
import type { AffiliateRevenueResponse } from '../types'
import { parseDateRange } from '../utils/date'

const affiliateRevenueRoute = new Hono()
const affiliateRevenue = new AffiliateRevenue()

affiliateRevenueRoute.get('/affiliate/revenue', async c => {
  const range = parseDateRange(c.req.query('startDate'), c.req.query('endDate'))
  if (!range.ok) return c.json({ error: range.error }, 400)

  try {
    const result: AffiliateRevenueResponse = await affiliateRevenue.getAffiliateRevenue(
      range.startTimestamp,
      range.endTimestamp
    )
    return c.json(result)
  } catch (error) {
    console.error('[Affiliate Revenue Error]:', error)
    return c.json(
      {
        error: 'Failed to fetch affiliate revenue',
        message: error instanceof Error ? error.message : String(error),
      },
      500
    )
  }
})

export { affiliateRevenueRoute }
