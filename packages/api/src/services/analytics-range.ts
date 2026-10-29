// Date-range semantics of the range analytics endpoints and MCP tools (spec 05 §6.3,
// BR-040). Pure (no database), so it is unit-tested on its own; the queries live in
// analytics-stats.ts. All calendar arithmetic reuses the ADR-017 helpers in time.ts.

import type { AnalyticsGranularity, AnalyticsRange } from '@betel/shared'
import { addDays, calendarDayIn, daysBetween, INVALID_TZ, isCalendarDay, resolveTimeZone } from './time.js'
import { InvalidRangeError, ValidationError } from './errors.js'

export const MAX_RANGE_DAYS = 366
export const DEFAULT_RANGE_DAYS = 30
/** Ranges up to this many days default to daily buckets, longer ones to weekly. */
const DAILY_DEFAULT_MAX_DAYS = 92

const GRANULARITIES: readonly AnalyticsGranularity[] = ['day', 'week', 'month']

export interface RangeInput {
  from?: string
  to?: string
  tz?: string
  granularity?: string
  compare?: boolean
}

export interface ResolvedRange extends AnalyticsRange {
  compare: boolean
  /** The equal-length window ending the day before `from`. */
  prevFrom: string
  prevTo: string
}

/**
 * Resolves and validates a range (tz first, then dates). Throws InvalidRangeError with
 * the spec 05 §6.8 messages, ValidationError for a bad granularity.
 */
export function resolveRange(input: RangeInput, now: Date = new Date()): ResolvedRange {
  const timeZone = resolveTimeZone(input.tz)
  if (!timeZone) throw new InvalidRangeError(INVALID_TZ)

  for (const d of [input.from, input.to]) {
    if (d !== undefined && !isCalendarDay(d)) {
      throw new InvalidRangeError('from/to must be a valid calendar date in YYYY-MM-DD format')
    }
  }

  const today = calendarDayIn(timeZone, now)
  const to = input.to ?? today
  const from = input.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1))

  if (from > to) throw new InvalidRangeError('from must be on or before to')
  if (to > today) throw new InvalidRangeError(`to cannot be in the future (today in ${timeZone} is ${today})`)
  const days = daysBetween(from, to) + 1
  if (days > MAX_RANGE_DAYS) throw new InvalidRangeError(`date range cannot exceed ${MAX_RANGE_DAYS} days`)

  let granularity: AnalyticsGranularity
  if (input.granularity === undefined) {
    granularity = days <= DAILY_DEFAULT_MAX_DAYS ? 'day' : 'week'
  } else if ((GRANULARITIES as readonly string[]).includes(input.granularity)) {
    granularity = input.granularity as AnalyticsGranularity
  } else {
    throw new ValidationError('granularity must be day, week or month')
  }

  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(days - 1))

  return { from, to, days, timeZone, granularity, compare: input.compare ?? true, prevFrom, prevTo }
}

/** The public `range` object of a response (no internal fields). */
export function rangeOutput(r: ResolvedRange): AnalyticsRange {
  return { from: r.from, to: r.to, days: r.days, timeZone: r.timeZone, granularity: r.granularity }
}

// Day of week of a YYYY-MM-DD string, Monday = 0.
function mondayIndex(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
}

/**
 * Every bucket label of the series, in order: `from` first (a partial first week or
 * month is clamped to `from`), then each Monday / 1st of the month inside the range.
 * Matches `GREATEST(date_trunc(granularity, …)::date, from)` in SQL.
 */
export function bucketLabels(from: string, to: string, granularity: AnalyticsGranularity): string[] {
  const labels: string[] = [from]
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) {
    if (granularity === 'day'
      || (granularity === 'week' && mondayIndex(d) === 0)
      || (granularity === 'month' && d.endsWith('-01'))) {
      labels.push(d)
    }
  }
  return labels
}

/** Percentage change per metric; null when the previous value is 0 (BR-040, Q5). */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** Validates an optional integer limit (REST passes strings, MCP numbers). */
export function parseLimit(value: unknown, def: number, max: number): number {
  if (value === undefined || value === null || value === '') return def
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1 || n > max) throw new ValidationError(`limit must be an integer between 1 and ${max}`)
  return n
}

/** Parses an optional boolean query parameter ("true"/"false"/"1"/"0"). */
export function parseBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  throw new ValidationError(`${name} must be true or false`)
}
