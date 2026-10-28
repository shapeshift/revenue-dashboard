import axios from 'axios'

import { mapConcurrently } from '../../utils/concurrency'
import { withRetry } from '../../utils/retry'

// Midgard caps a history request at 400 intervals, so hourly history is fetched in chunks just under that
const CHUNK_SECONDS = 399 * 3600

export const fetchMidgardHourlyHistory = async <T>(
  context: string,
  url: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<T[]> => {
  const chunks: [number, number][] = []
  for (let from = startTimestamp; from < endTimestamp; from += CHUNK_SECONDS) {
    chunks.push([from, Math.min(from + CHUNK_SECONDS, endTimestamp)])
  }

  const pages = await mapConcurrently(chunks, 4, ([from, to]) =>
    withRetry(context, () =>
      axios.get<{ intervals?: T[] }>(url, { params: { from, to, interval: 'hour' }, timeout: 30_000 })
    )
  )

  return pages.flatMap(({ data }) => data.intervals ?? [])
}
