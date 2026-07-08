import { describe, expect, test } from 'bun:test'

import { parseDateRange } from './date'

describe('parseDateRange', () => {
  test('accepts a valid ordered range', () => {
    const result = parseDateRange('2024-01-01', '2024-12-31')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.startTimestamp).toBeLessThan(result.endTimestamp)
    }
  })

  test('accepts a single-day range (start === end)', () => {
    const result = parseDateRange('2024-06-15', '2024-06-15')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.startTimestamp).toBeLessThan(result.endTimestamp) // start 00:00:00Z, end 23:59:59Z
    }
  })

  test('rejects a reversed range', () => {
    const result = parseDateRange('2024-12-31', '2024-01-01')
    expect(result).toEqual({ ok: false, error: 'startDate must be on or before endDate' })
  })

  test('rejects a malformed date', () => {
    expect(parseDateRange('2024-1-1', '2024-01-01').ok).toBe(false)
    expect(parseDateRange('2024-01-01', undefined).ok).toBe(false)
  })
})
