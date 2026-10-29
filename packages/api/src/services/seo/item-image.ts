// Field selection of an item's picture — rule (a) of the README "Fixed contracts"
// (owned by spec 06): Card → `data.thumbnail`, Poster → `data.imageUrl`. The data is
// already locale-merged (a locale override wins over the base image); the server
// renders the default locale, so this is the base image there.
//
// og:image on item pages uses spec 06's 1200×630 derivative of an uploaded image
// (services/preview-image.ts + og-image.ts, resolved in page-data.ts); this path is the
// fallback for images outside /uploads/ and for JSON-LD Event.image (rule (a) only).

import { safeUrl } from './escape.js'
import type { FeedItem } from './page-model.js'

/** Root-relative or absolute http(s) URL of the item's own picture, or null. */
export function itemImagePath(item: Pick<FeedItem, 'type' | 'data'>): string | null {
  const field = item.type === 'card' ? item.data.thumbnail : item.type === 'poster' ? item.data.imageUrl : null
  const url = safeUrl(field)
  return url && !/^(mailto|tel):/i.test(url) ? url : null
}
