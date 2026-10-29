// Calendar-day and timezone helpers shared by the public hub and the admin.
//
// Event dates (`data.startDate` / `data.endDate`) are plain calendar days in
// the church's timezone, so "is this event over?" is always answered in
// Romania, never in the visitor's or editor's own timezone. Logs and
// statistics are stored in UTC and shown in the viewer's timezone.

export { CHURCH_TIME_ZONE } from '@betel/shared'

// The viewer's IANA timezone, e.g. "Europe/Bucharest" or "America/Chicago".
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

// The calendar day (YYYY-MM-DD) that `at` falls on in `timeZone`
// (defaults to the viewer's timezone).
export function calendarDay(timeZone: string = viewerTimeZone(), at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

// Formats a YYYY-MM-DD calendar day without shifting it through any timezone.
// `new Date('2026-10-25')` is UTC midnight, which renders as 24 October west of
// UTC; formatting it in UTC keeps the day the editor picked.
export function formatCalendarDay(
  day: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: 'UTC' })
}

// Short chart label for a YYYY-MM-DD bucket, e.g. "05 oct.".
export function formatDayLabel(day: string): string {
  const dd = day.slice(8, 10)
  return `${dd} ${formatCalendarDay(day, 'ro-RO', { month: 'short' })}`
}
