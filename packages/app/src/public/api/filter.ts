import type { ContentItem } from './client'

// Mirror of the admin's isItemPast logic. The server already filters expired
// items, but a timezone gap between the API container (UTC) and the visitor's
// local clock can leak items the admin already considers past. This client
// safety net hides them using the visitor's local "today" so the public view
// stays consistent with how the same items appear (struck through) in the
// admin tool.
// JS parses "YYYY-MM-DD" as UTC midnight, which lands a day too early in
// negative-UTC zones. Treat the bare date as the visitor's local calendar day
// so the comparison with `today` (also local) reflects what the visitor sees
// on a wall calendar, not what UTC says.
function parseLocalDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(s)
}

export function isItemPast(item: ContentItem, now: Date = new Date()): boolean {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const d = item.data as { endDate?: string; startDate?: string }
  if (d.endDate)   return parseLocalDate(d.endDate)   < today
  if (d.startDate) return parseLocalDate(d.startDate) < today
  if (item.expiresAt) return new Date(item.expiresAt) <= today
  return false
}

export function filterCurrent(items: ContentItem[], now: Date = new Date()): ContentItem[] {
  return items.filter(item => !isItemPast(item, now))
}
