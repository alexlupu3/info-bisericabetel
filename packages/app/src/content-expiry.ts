import { CHURCH_TIME_ZONE, calendarDay } from './dates'

type ExpirableItem = { data: unknown; expiresAt: string | null }

// Mirrors the public API's visibility filter (routes/content.ts):
// endDate wins, then startDate; an item stays current through the end of that
// day in Romania. `expiresAt` is an instant and expires exactly when reached.
// Used by the admin "expirat" badge and as the public hub's client-side
// safety net, so both agree with the server wherever the viewer is.
export function isItemPast(item: ExpirableItem, now: Date = new Date()): boolean {
  const today = calendarDay(CHURCH_TIME_ZONE, now)
  const d = item.data as { endDate?: string; startDate?: string }
  if (d.endDate)   return d.endDate.slice(0, 10)   < today
  if (d.startDate) return d.startDate.slice(0, 10) < today
  if (item.expiresAt) return new Date(item.expiresAt) <= now
  return false
}
