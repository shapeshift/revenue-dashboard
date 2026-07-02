import { AffiliateRevenue } from '../affiliateRevenue'

import { createRevenueRoute } from './revenueRoute'

const affiliateRevenue = new AffiliateRevenue()

const affiliateRevenueRoute = createRevenueRoute('/affiliate/revenue', 'Affiliate revenue', (start, end) =>
  affiliateRevenue.getAffiliateRevenue(start, end)
)

export { affiliateRevenueRoute }
