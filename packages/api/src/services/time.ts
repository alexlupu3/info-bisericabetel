// Calendar-day and timezone helpers.
//
// Instants are stored as TIMESTAMPTZ (UTC). Event dates (`data.startDate` /
// `data.endDate`) are plain calendar days in the church's timezone: an event
// stays visible until the end of its last day in Romania, wherever the server
// or the visitor happens to be.

export const CHURCH_TIME_ZONE = 'Europe/Bucharest'

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

// True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30).
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = CALENDAR_DAY.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === value
}

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function zonedParts(tz: string, at: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

// The calendar day (YYYY-MM-DD) that `at` falls on in `tz`.
export function calendarDayIn(tz: string, at: Date = new Date()): string {
  const p = zonedParts(tz, at)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

// Calendar arithmetic on YYYY-MM-DD strings (no timezone involved).
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

// Offset of `tz` from UTC at instant `atMs`, in milliseconds.
function offsetMs(tz: string, atMs: number): number {
  const p = zonedParts(tz, new Date(atMs))
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wallAsUtc - Math.floor(atMs / 1000) * 1000
}

// The instant at which `day` begins in `tz` (DST-aware).
export function startOfDayIn(day: string, tz: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`)
  const firstGuess = wall - offsetMs(tz, wall)
  return new Date(wall - offsetMs(tz, firstGuess))
}

// Returns an error message when `data.startDate` / `data.endDate` is present
// but is not a YYYY-MM-DD calendar day. Null values mean "clear the field".
export function invalidEventDate(data: Record<string, unknown>): string | null {
  for (const key of ['startDate', 'endDate']) {
    const value = data[key]
    if (value === undefined || value === null) continue
    if (!isCalendarDay(value)) return `${key} must be a calendar date in YYYY-MM-DD format`
  }
  return null
}

// Parses an `expiresAt` value. A bare calendar day means "visible through the
// end of that day in Romania", i.e. it expires when the next church-local day
// begins. Anything else must be a parseable instant. Returns undefined when
// the value is invalid.
export function parseExpiresAt(value: string): Date | undefined {
  if (isCalendarDay(value)) return startOfDayIn(addDays(value, 1), CHURCH_TIME_ZONE)
  const d = new Date(value)
  return isNaN(d.getTime()) ? undefined : d
}
