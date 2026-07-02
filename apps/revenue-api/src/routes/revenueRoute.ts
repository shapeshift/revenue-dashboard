import { Hono } from 'hono'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

type DateRange = { ok: true; startTimestamp: number; endTimestamp: number } | { ok: false; error: string }

// Validate YYYY-MM-DD start/end query params into UTC day-bounded unix timestamps.
export function parseDateRange(startDate?: string, endDate?: string): DateRange {
  if (!startDate || !DATE_REGEX.test(startDate)) {
    return { ok: false, error: 'Invalid startDate format, expected YYYY-MM-DD' }
  }
  if (!endDate || !DATE_REGEX.test(endDate)) {
    return { ok: false, error: 'Invalid endDate format, expected YYYY-MM-DD' }
  }

  const startTimestamp = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000)
  const endTimestamp = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000)

  if (isNaN(startTimestamp)) return { ok: false, error: 'Invalid startDate value' }
  if (isNaN(endTimestamp)) return { ok: false, error: 'Invalid endDate value' }

  return { ok: true, startTimestamp, endTimestamp }
}

// Build a GET route that validates a start/end date range, runs `fetchRevenue`, and returns its
// JSON — with shared 400 (bad date range) and 500 (fetch failure) handling.
export function createRevenueRoute<T>(
  path: string,
  label: string,
  fetchRevenue: (startTimestamp: number, endTimestamp: number) => Promise<T>
): Hono {
  const route = new Hono()

  route.get(path, async c => {
    const range = parseDateRange(c.req.query('startDate'), c.req.query('endDate'))
    if (!range.ok) return c.json({ error: range.error }, 400)

    try {
      return c.json(await fetchRevenue(range.startTimestamp, range.endTimestamp))
    } catch (error) {
      console.error(`[${label} Error]:`, error)
      return c.json(
        {
          error: `Failed to fetch ${label.toLowerCase()}`,
          message: error instanceof Error ? error.message : String(error),
        },
        500
      )
    }
  })

  return route
}
