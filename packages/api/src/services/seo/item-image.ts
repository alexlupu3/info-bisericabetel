// Field selection of an item's picture — rule (a) of the README "Fixed contracts"
// (owned by spec 06): Card → `data.thumbnail`, Poster → `data.imageUrl`. The data is
// already locale-merged (a locale override wins over the base image); the server
// renders the default locale, so this is the base image there.
//
// Spec 06's share-image service (services/preview-image.ts, 1200×630 derivatives)
// does not exist yet; until it does, og:image on item pages is this image made
// absolute, with the organisation logo as the last fallback (spec 03 §6.2.3).

import { safeUrl } from './escape.js'
import type { FeedItem } from './page-model.js'

/** Root-relative or absolute http(s) URL of the item's own picture, or null. */
export function itemImagePath(item: Pick<FeedItem, 'type' | 'data'>): string | null {
  const field = item.type === 'card' ? item.data.thumbnail : item.type === 'poster' ? item.data.imageUrl : null
  const url = safeUrl(field)
  return url && !/^(mailto|tel):/i.test(url) ? url : null
}
