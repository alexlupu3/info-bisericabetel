import type { ContentItem } from './client'
import { isItemPast } from '../../content-expiry'

// Client-side safety net on top of the API's own expiry filter. It uses the
// same Romania-local rule as the server and the admin badge (see
// content-expiry.ts), so a visitor in another timezone never loses an event
// before the end of its day in Bucharest.
export function filterCurrent(items: ContentItem[], now: Date = new Date()): ContentItem[] {
  return items.filter(item => !isItemPast(item, now))
}
