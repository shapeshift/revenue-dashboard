import { Hono } from 'hono'
import { AffiliateRevenue } from '../affiliateRevenue'
import type { AffiliateRevenueResponse } from '../types'

const affiliateRevenueRoute = new Hono()
const affiliateRevenue = new AffiliateRevenue()

affiliateRevenueRoute.get('/affiliate/revenue', async (c) => {
  try {
    const startDate = c.req.query('startDate')
    const endDate = c.req.query('endDate')

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!startDate || !dateRegex.test(startDate)) {
      return c.json({ error: 'Invalid startDate format, expected YYYY-MM-DD' }, 400)
    }
    if (!endDate || !dateRegex.test(endDate)) {
      return c.json({ error: 'Invalid endDate format, expected YYYY-MM-DD' }, 400)
    }

    // Validate dates are valid calendar dates
    const startTimestamp = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000)
    const endTimestamp = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000)

    if (isNaN(startTimestamp)) {
      return c.json({ error: 'Invalid startDate value' }, 400)
    }
    if (isNaN(endTimestamp)) {
      return c.json({ error: 'Invalid endDate value' }, 400)
    }

    const result: AffiliateRevenueResponse = await affiliateRevenue.getAffiliateRevenue(
      startTimestamp,
      endTimestamp
    )

    return c.json(result)
  } catch (error) {
    console.error('[Affiliate Revenue Error]:', error)
    return c.json({
      error: 'Failed to fetch affiliate revenue',
      message: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

export { affiliateRevenueRoute }
