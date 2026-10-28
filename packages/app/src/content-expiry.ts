import { CHURCH_TIME_ZONE, calendarDay } from './dates'

type ExpirableItem = { data: unknown; expiresAt: string | null }

// Mirrors the public API's visibility filter (routes/content.ts), where the
// event dates and `expiresAt` are independent: either one alone expires the
// item. For the dates, endDate wins over startDate and an item stays current
// through the end of that day in Romania. `expiresAt` is an instant and
// expires exactly when reached. Used by the admin "expirat" badge and as the
// public hub's client-side safety net, so both agree with the server wherever
// the viewer is.
export function isItemPast(item: ExpirableItem, now: Date = new Date()): boolean {
  if (item.expiresAt && new Date(item.expiresAt) <= now) return true
  const today = calendarDay(CHURCH_TIME_ZONE, now)
  const d = item.data as { endDate?: string; startDate?: string }
  const lastDay = d.endDate ?? d.startDate
  return lastDay ? lastDay.slice(0, 10) < today : false
}
