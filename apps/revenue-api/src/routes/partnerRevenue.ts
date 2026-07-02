import { Hono } from 'hono'

import { AffiliateRevenue } from '../affiliateRevenue'
import type { PartnerRevenueResponse } from '../types'
import { parseDateRange } from '../utils/parseDateRange'

const partnerRevenueRoute = new Hono()
const affiliateRevenue = new AffiliateRevenue()

partnerRevenueRoute.get('/partner/revenue', async c => {
  const range = parseDateRange(c.req.query('startDate'), c.req.query('endDate'))
  if (!range.ok) return c.json({ error: range.error }, 400)

  try {
    const result: PartnerRevenueResponse = await affiliateRevenue.getPartnerRevenue(
      range.startTimestamp,
      range.endTimestamp
    )
    return c.json(result)
  } catch (error) {
    console.error('[Partner Revenue Error]:', error)
    return c.json(
      {
        error: 'Failed to fetch partner revenue',
        message: error instanceof Error ? error.message : String(error),
      },
      500
    )
  }
})

export { partnerRevenueRoute }
