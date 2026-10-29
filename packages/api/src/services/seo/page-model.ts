// The data a server-rendered public page is built from (spec 03 §6.3), and the
// pure rules that derive it: feed grouping and Event eligibility (§6.2.3).
// No database access here, so renderers and tests can build a model from fixtures.

import type { Language, Site } from '@betel/shared'
import { itemDisplayTitle, itemSiteSlug } from '@betel/shared'
import { selectUpcomingEvents } from '../upcoming-events.js'
import type { SeoConfig } from './organization.js'

/** A `sites` row as GET /api/sites returns it. */
export type PublicSite = Site & { createdAt?: string | Date }

/** An item as GET /api/content returns it. */
export interface FeedItem {
  id: string
  type: string
  state: string
  sites: string[]
  exclusiveSite: string | null
  orderPosition: number
  groupId: string | null
  groupTitle: string | null
  expiresAt: string | Date | null
  data: Record<string, unknown>
  createdAt: string | Date
  updatedAt: string | Date
}

export type PageKind = 'hub' | 'site' | 'item' | 'not-found' | 'gone'

/** An item that is marked up as a schema.org Event, with the site it takes place at. */
export interface EventEntry {
  item: FeedItem
  site: PublicSite
}

export interface PageModel {
  kind: PageKind
  /** Request path without query string, e.g. "/", "/centru", "/i/<uuid>". */
  path: string
  status: number
  baseUrl: string
  /** Default language code (`languages.is_default`), used for <html lang>. */
  lang: string
  config: SeoConfig
  sites: PublicSite[]
  languages: Language[]
  /** The site of a site page, or the resolved site of an item page; null otherwise. */
  site: PublicSite | null
  /** Feed of a hub page (display order); empty on other pages. */
  items: FeedItem[]
  /** The item of an item page. */
  item: FeedItem | null
  /** Eligible events (§6.2.3): ItemList entries on hub pages, the Event on an item page. */
  events: EventEntry[]
}

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Which site an item takes place at (§6.2.3): its exclusive site; else the site page
 * being rendered; else the single entry of its `sites[]` surfacing hint; else none.
 */
export function resolveItemSite(item: FeedItem, pageSite: PublicSite | null, sites: PublicSite[]): PublicSite | null {
  const bySlug = (slug: string) => sites.find(s => s.slug === slug) ?? null
  if (item.exclusiveSite) return bySlug(item.exclusiveSite)
  if (pageSite) return pageSite
  const own = itemSiteSlug(item)
  return own ? bySlug(own) : null
}

/**
 * BR-030: a visible Card with a valid `data.startDate`, a title, and exactly one
 * resolvable site is an Event. Richtext/Poster/Video items never are.
 */
export function eventSiteFor(item: FeedItem, pageSite: PublicSite | null, sites: PublicSite[]): PublicSite | null {
  if (item.type !== 'card') return null
  const start = item.data.startDate
  if (typeof start !== 'string' || !CALENDAR_DAY.test(start)) return null
  if (!itemDisplayTitle(item)) return null
  return resolveItemSite(item, pageSite, sites)
}

/** Eligible events among visible items, chronological (spec 02's selectUpcomingEvents). */
export function selectEvents(items: FeedItem[], pageSite: PublicSite | null, sites: PublicSite[]): EventEntry[] {
  const entries: EventEntry[] = []
  for (const item of selectUpcomingEvents(items)) {
    const site = eventSiteFor(item, pageSite, sites)
    if (site) entries.push({ item, site })
  }
  return entries
}

export type FeedBlock =
  | { kind: 'group'; groupId: string; title: string; items: FeedItem[] }
  | { kind: 'item'; item: FeedItem }

/**
 * Collapses items into blocks exactly like the SPA's HomePage `Feed`: an item with a
 * group pulls every item of that group (in order) into one block.
 */
export function groupFeed(items: FeedItem[]): FeedBlock[] {
  const blocks: FeedBlock[] = []
  let i = 0
  while (i < items.length) {
    const item = items[i]
    if (item.groupId) {
      const groupItems = items.filter(it => it.groupId === item.groupId)
      blocks.push({ kind: 'group', groupId: item.groupId, title: item.groupTitle ?? '', items: groupItems })
      i += groupItems.length
    } else {
      blocks.push({ kind: 'item', item })
      i++
    }
  }
  return blocks
}

export interface PageModelInput {
  kind: PageKind
  path: string
  status?: number
  baseUrl: string
  config: SeoConfig
  sites: PublicSite[]
  languages: Language[]
  /** Site page slug (kind 'site'). */
  siteSlug?: string | null
  items?: FeedItem[]
  item?: FeedItem | null
}

export function buildPageModel(input: PageModelInput): PageModel {
  const lang = input.languages.find(l => l.isDefault)?.code ?? 'ro'
  const pageSite = input.kind === 'site' && input.siteSlug
    ? input.sites.find(s => s.slug === input.siteSlug) ?? null
    : null
  const base = {
    kind: input.kind,
    path: input.path,
    baseUrl: input.baseUrl,
    lang,
    config: input.config,
    sites: input.sites,
    languages: input.languages,
  }

  if (input.kind === 'item' && input.item) {
    const item = input.item
    const site = resolveItemSite(item, null, input.sites)
    const eventSite = eventSiteFor(item, null, input.sites)
    return {
      ...base, status: input.status ?? 200, site, items: [], item,
      events: eventSite ? [{ item, site: eventSite }] : [],
    }
  }

  if (input.kind === 'hub' || input.kind === 'site') {
    const items = input.items ?? []
    return {
      ...base, status: input.status ?? 200, site: pageSite, items, item: null,
      events: selectEvents(items, pageSite, input.sites),
    }
  }

  return {
    ...base, status: input.status ?? (input.kind === 'gone' ? 410 : 404),
    site: null, items: [], item: null, events: [],
  }
}
