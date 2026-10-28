// Event-time helpers shared by the API, the app and any future package.
//
// An event's start time (`data.startTime`) is a Bucharest wall-clock "HH:mm" on
// the calendar day `data.startDate`, allowed only on single-day events
// (ADR-023, BR-035). These helpers are pure and depend on `Intl` only.

/** IANA zone every event wall-clock value is anchored to (ADR-017 / BR-015). */
export const CHURCH_TIME_ZONE = 'Europe/Bucharest'

/** The shared date fields of a content item (`data.startDate` / `data.endDate` / `data.startTime`). */
export interface EventSchedule {
  startDate?: string | null   // YYYY-MM-DD
  endDate?: string | null     // YYYY-MM-DD
  startTime?: string | null   // HH:mm, 24-hour, Bucharest wall clock
}

export const CLOCK_TIME_PATTERN: RegExp = /^([01]\d|2[0-3]):[0-5]\d$/

const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** True for a canonical "HH:mm" string. */
export function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && CLOCK_TIME_PATTERN.test(value)
}

/** True when startDate is set and endDate is absent or equal to it. */
export function isSingleDayEvent(schedule: EventSchedule): boolean {
  return !!schedule.startDate && (!schedule.endDate || schedule.endDate === schedule.startDate)
}

/**
 * Validation for data.startTime. Returns null when valid or absent (undefined/null),
 * otherwise one of the three fixed messages (in that order of precedence).
 * Assumes dates were already validated by invalidEventDate().
 */
export function invalidStartTime(schedule: EventSchedule): string | null {
  const { startTime } = schedule
  if (startTime === undefined || startTime === null) return null
  if (!isClockTime(startTime)) return 'startTime must be a 24-hour clock time in HH:mm format'
  if (!schedule.startDate) return 'startTime requires startDate'
  if (!isSingleDayEvent(schedule)) {
    return 'startTime is only allowed for single-day events (no endDate, or endDate equal to startDate)'
  }
  return null
}

// --- Intl formatter cache -------------------------------------------------

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let f = formatterCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options)
    formatterCache.set(key, f)
  }
  return f
}

// --- Instants and offsets -------------------------------------------------

// Offset of `timeZone` from UTC at instant `atMs`, in milliseconds (rounded to the second).
function offsetMs(timeZone: string, atMs: number): number {
  const parts = formatter('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(atMs))
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value)
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return wallAsUtc - Math.floor(atMs / 1000) * 1000
}

function parseCalendarDay(day: string): [number, number, number] {
  const m = CALENDAR_DAY_PATTERN.exec(day)
  if (!m) throw new RangeError(`Invalid calendar day: ${day}`)
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new RangeError(`Invalid calendar day: ${day}`)
  }
  return [y, mo, d]
}

/**
 * The instant at which the event starts: `startDate` at `startTime` on the wall clock of
 * `timeZone` (default CHURCH_TIME_ZONE), or the start of that day when startTime is absent.
 * DST-aware: a wall-clock time that does not exist (spring-forward gap) resolves one hour
 * later; an ambiguous one (autumn overlap) resolves to the later, standard-time instant.
 * Throws RangeError on a malformed startDate/startTime.
 */
export function eventStartInstant(startDate: string, startTime?: string | null, timeZone: string = CHURCH_TIME_ZONE): Date {
  const [y, mo, d] = parseCalendarDay(startDate)
  let hh = 0
  let mm = 0
  if (startTime !== undefined && startTime !== null) {
    if (!isClockTime(startTime)) throw new RangeError(`Invalid clock time: ${startTime}`)
    hh = Number(startTime.slice(0, 2))
    mm = Number(startTime.slice(3, 5))
  }
  const wall = Date.UTC(y, mo - 1, d, hh, mm)
  const guess = wall - offsetMs(timeZone, wall)
  return new Date(wall - offsetMs(timeZone, guess))
}

/** "+02:00" / "+03:00": the UTC offset of `timeZone` at `at`, formatted ±HH:MM. */
export function utcOffsetAt(at: Date, timeZone: string = CHURCH_TIME_ZONE): string {
  const minutes = Math.round(offsetMs(timeZone, at.getTime()) / 60_000)
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/**
 * ISO-8601 for consumers that need a string: "2026-11-14T18:00:00+02:00" (offset of
 * `timeZone` at that instant, "+03:00" in summer) when startTime is present, else the
 * date-only "2026-11-14". Suitable for schema.org Event.startDate and <time dateTime>.
 */
export function eventStartIso(startDate: string, startTime?: string | null, timeZone: string = CHURCH_TIME_ZONE): string {
  if (startTime === undefined || startTime === null) {
    parseCalendarDay(startDate)
    return startDate
  }
  const instant = eventStartInstant(startDate, startTime, timeZone)
  const offset = utcOffsetAt(instant, timeZone)
  // Wall clock at the instant (may differ from startTime inside a DST gap).
  const local = new Date(instant.getTime() + offsetMs(timeZone, instant.getTime()))
  return `${local.toISOString().slice(0, 19)}${offset}`
}

// --- Human text -----------------------------------------------------------

export interface FormatEventWhenOptions {
  /** Intl options for the date part(s). Default { day: 'numeric', month: 'long' }. */
  dateOptions?: Intl.DateTimeFormatOptions
  /** Intl options for the time part. Default { hour: 'numeric', minute: '2-digit' }. */
  timeOptions?: Intl.DateTimeFormatOptions
  /** Between date and time. Default " · ". */
  separator?: string
  /** Between the two dates of a range. Default " – " (en dash). */
  rangeSeparator?: string
  /** Zone the time is expressed in. Default CHURCH_TIME_ZONE. */
  timeZone?: string
}

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
const DEFAULT_TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

function formatDay(day: string, locale: string, dateOptions: Intl.DateTimeFormatOptions): string {
  try {
    const [y, mo, d] = parseCalendarDay(day.slice(0, 10))
    return formatter(locale, { ...dateOptions, timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, d)))
  } catch {
    return day
  }
}

/** Just the time part ("18:00", "6:00 PM"); null when absent or not single-day. */
export function formatEventTime(
  schedule: EventSchedule,
  locale: string,
  options?: Pick<FormatEventWhenOptions, 'timeOptions' | 'timeZone'>,
): string | null {
  const { startDate, startTime } = schedule
  if (!startTime || !startDate || !isSingleDayEvent(schedule)) return null
  const timeZone = options?.timeZone ?? CHURCH_TIME_ZONE
  try {
    const instant = eventStartInstant(startDate, startTime, timeZone)
    return formatter(locale, { ...(options?.timeOptions ?? DEFAULT_TIME_OPTIONS), timeZone }).format(instant)
  } catch {
    return startTime
  }
}

/**
 * Human text for "when": null without startDate; "{start}{rangeSeparator}{end}" for a
 * multi-day range; "{date}" for a single day without time; "{date}{separator}{time}" with
 * time. Date parts are formatted as calendar days (no zone shift); the time part is the
 * Bucharest wall clock formatted in `locale` (BCP-47, e.g. "ro-RO", "en-US"), so hour
 * cycle and AM/PM follow the language. Never throws on malformed input: falls back to the
 * raw strings so one bad legacy row cannot break a page.
 */
export function formatEventWhen(schedule: EventSchedule, locale: string, options?: FormatEventWhenOptions): string | null {
  const { startDate, endDate } = schedule
  if (!startDate) return null
  const dateOptions = options?.dateOptions ?? DEFAULT_DATE_OPTIONS
  const start = formatDay(startDate, locale, dateOptions)
  if (!isSingleDayEvent(schedule)) {
    return `${start}${options?.rangeSeparator ?? ' – '}${formatDay(endDate!, locale, dateOptions)}`
  }
  const time = formatEventTime(schedule, locale, options)
  return time ? `${start}${options?.separator ?? ' · '}${time}` : start
}

// --- Ordering -------------------------------------------------------------

/**
 * Sort key for BR-013: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"; null when undated.
 * Plain string order gives date ascending, then untimed before timed, then time ascending.
 */
export function eventSortKey(schedule: EventSchedule): string | null {
  if (!schedule.startDate) return null
  return schedule.startTime ? `${schedule.startDate}T${schedule.startTime}` : schedule.startDate
}

/** Comparator for Array.prototype.sort implementing BR-013 (undated last, 0 for ties → stable). */
export function compareEventSchedules(a: EventSchedule, b: EventSchedule): number {
  const ka = eventSortKey(a)
  const kb = eventSortKey(b)
  if (!ka && !kb) return 0
  if (!ka) return 1
  if (!kb) return -1
  return ka < kb ? -1 : ka > kb ? 1 : 0
}
