import { AffiliateRevenue } from '../affiliateRevenue'

import { createRevenueRoute } from './revenueRoute'

const affiliateRevenue = new AffiliateRevenue()

const partnerRevenueRoute = createRevenueRoute('/partner/revenue', 'Partner revenue', (start, end) =>
  affiliateRevenue.getPartnerRevenue(start, end)
)

export { partnerRevenueRoute }
