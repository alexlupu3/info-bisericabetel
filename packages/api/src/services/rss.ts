// RSS 2.0 serializer of the event feed (spec 02 §6.5, ADR-021).
//
// Pure: no database, no Fastify, no clock. `buildEventFeed` is a deterministic function of
// its `FeedInput` — the same input always yields a byte-identical body (and so the same
// ETag), which is what makes `304 Not Modified` work for pollers (FR-063). Never write a
// request-time value (lastBuildDate, "now", random ids) into the output.

import {
  eventStartIso,
  formatEventWhen,
  isSingleDayEvent,
  itemSchedule,
  readLocation,
  siteAddressLine,
  type SiteAddressFields,
} from '@betel/shared'
import { absoluteUrl } from './public-url.js'
import { escapeXml, safeUrl } from './seo/escape.js'

export const RSS_NAMESPACES = {
  atom: 'http://www.w3.org/2005/Atom',
  ev: 'http://purl.org/rss/1.0/modules/event/',
  betel: 'urn:betel:feed:1.0',
} as const

/** Feed reader refresh hint in minutes; equals the HTTP `max-age` (FR-063). */
export const FEED_TTL_MINUTES = 5

const RICHTEXT_TITLE_MAX = 80

/** A `sites` row as far as the feed needs it. */
export type FeedSite = { slug: string; name: string } & SiteAddressFields

/** A visible item (as `listPublicContent` returns it, data already locale-merged). */
export interface FeedEntry {
  id: string
  type: string
  sites: string[] | null
  exclusiveSite: string | null
  groupTitle: string | null
  createdAt: Date | string
  data: Record<string, unknown>
}

/** Final (translated, interpolated) texts of the channel and the description labels. */
export interface FeedTexts {
  title: string
  description: string
  when: string
  where: string
  details: string
  untitled: string
}

/** A `media` row matched by exact URL (§6.5.1). */
export interface FeedMedia {
  size: number
  mimeType: string
}

export interface FeedInput {
  /** Public origin (PUBLIC_BASE_URL), no trailing slash. */
  baseUrl: string
  /** The site of a per-site feed; null for the all-sites feed. */
  site: FeedSite | null
  /** Effective language code (`<language>`). */
  lang: string
  /** True when `lang` is the default locale: the self link then carries no `?lang=`. */
  isDefaultLang: boolean
  /** Intl locale for the "when" text, e.g. "ro-RO". */
  dateLocale: string
  texts: FeedTexts
  /** Release version for `<generator>`. */
  version: string
  /** Every site (names and addresses of the applicable sites). */
  sites: FeedSite[]
  /** Selected items, already in feed order (selectUpcomingEvents). */
  items: FeedEntry[]
  /** Matched media rows keyed by the stored image URL. */
  media: Record<string, FeedMedia>
}

// --- Field rules (pure helpers, exported for tests and the route) ---------

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** "When" text of an item: long date (with weekday and year) and time when set. */
export function feedWhenText(data: Record<string, unknown>, dateLocale: string): string {
  const options = {
    dateOptions: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } as Intl.DateTimeFormatOptions,
    separator: ', ',
  }
  return formatEventWhen(itemSchedule(data), dateLocale, options) ?? String(data.startDate ?? '')
}

/** First non-empty line of a Markdown body with leading markers stripped, truncated. */
export function firstLineTitle(body: string): string | null {
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/^[\s#*_>]+/, '').trim()
    if (line) return line.length > RICHTEXT_TITLE_MAX ? line.slice(0, RICHTEXT_TITLE_MAX).trimEnd() : line
  }
  return null
}

/** Item `<title>`: per-type field, then `"<untitled> — <when>"`; never empty. */
export function feedItemTitle(item: Pick<FeedEntry, 'type' | 'data'>, untitled: string, when: string): string {
  const d = item.data
  let title: string | null = null
  switch (item.type) {
    case 'card':
    case 'video':
      title = str(d.title)
      break
    case 'richtext':
      title = str(d.title) ?? (typeof d.body === 'string' ? firstLineTitle(d.body) : null)
      break
    case 'poster':
      title = str(d.alt)
      break
  }
  return title?.trim() || `${untitled} — ${when}`
}

/** Slugs of the sites an item applies to in this feed: exclusive, else sites[], else the feed's site. */
export function applicableSiteSlugs(item: Pick<FeedEntry, 'sites' | 'exclusiveSite'>, feedSite: FeedSite | null): string[] {
  if (item.exclusiveSite) return [item.exclusiveSite]
  if (item.sites && item.sites.length > 0) return [...item.sites]
  return feedSite ? [feedSite.slug] : []
}

function siteLabel(site: FeedSite): string {
  const address = siteAddressLine(site)
  return address ? `${site.name} — ${address}` : site.name
}

/**
 * The location text shared by the description's where line and `ev:location`:
 * `data.location` (spec 07) first; else the single applicable site ("<name> — <address>");
 * else null (e.g. church-wide items in the all-sites feed).
 */
export function locationText(item: Pick<FeedEntry, 'data' | 'sites' | 'exclusiveSite'>, feedSite: FeedSite | null, sites: FeedSite[]): string | null {
  const explicit = readLocation(item.data)
  if (explicit) return explicit
  let single: FeedSite | null = null
  if (feedSite) single = feedSite
  else {
    const slug = item.exclusiveSite ?? (item.sites && item.sites.length === 1 ? item.sites[0] : null)
    single = slug ? sites.find(s => s.slug === slug) ?? null : null
  }
  return single ? siteLabel(single) : null
}

/** Link Resolution Rule: site feed → siteLinks[slug] || link; all-sites feed → link. http(s) only. */
export function actionLink(data: Record<string, unknown>, feedSite: FeedSite | null): string | null {
  const siteLinks = data.siteLinks && typeof data.siteLinks === 'object' ? data.siteLinks as Record<string, unknown> : {}
  const raw = (feedSite ? str(siteLinks[feedSite.slug]) : null) ?? str(data.link)
  const url = raw ? safeUrl(raw.trim()) : null
  if (!url || /^(mailto|tel):/i.test(url)) return url
  return url.startsWith('/') ? null : url
}

/**
 * The stored URL of the item's original image (rule (a): Card → thumbnail, Poster →
 * imageUrl) when it can be an upload (root-relative); null for none or external URLs.
 */
export function enclosurePath(item: Pick<FeedEntry, 'type' | 'data'>): string | null {
  const field = item.type === 'card' ? item.data.thumbnail : item.type === 'poster' ? item.data.imageUrl : null
  if (typeof field !== 'string' || !field.startsWith('/') || field.startsWith('//')) return null
  return field
}

function itemText(item: Pick<FeedEntry, 'type' | 'data'>): string {
  const d = item.data
  const raw = item.type === 'card' ? d.description : item.type === 'richtext' ? d.body : item.type === 'video' ? d.url : null
  return typeof raw === 'string' ? raw.trim() : ''
}

function rfc822(value: Date | string): string {
  return new Date(value).toUTCString()
}

function startDateW3c(data: Record<string, unknown>): string {
  const schedule = itemSchedule(data)
  const start = schedule.startDate!
  try {
    return schedule.startTime && isSingleDayEvent(schedule) ? eventStartIso(start, schedule.startTime) : eventStartIso(start)
  } catch {
    return start.slice(0, 10)
  }
}

// --- Serializer -----------------------------------------------------------

function el(name: string, text: string, attrs = ''): string {
  return `<${name}${attrs}>${escapeXml(text)}</${name}>`
}

/** The feed URL of a channel, with `?lang=` when the language is not the default. */
export function feedSelfUrl(input: Pick<FeedInput, 'baseUrl' | 'site' | 'lang' | 'isDefaultLang'>): string {
  const path = input.site ? `/${encodeURIComponent(input.site.slug)}/feed.xml` : '/feed.xml'
  const query = input.isDefaultLang ? '' : `?lang=${encodeURIComponent(input.lang)}`
  return absoluteUrl(`${path}${query}`, input.baseUrl)
}

function renderItem(item: FeedEntry, input: FeedInput): string {
  const { texts, site: feedSite, sites, baseUrl } = input
  const when = feedWhenText(item.data, input.dateLocale)
  const where = locationText(item, feedSite, sites)
  const link = actionLink(item.data, feedSite)
  const schedule = itemSchedule(item.data)

  const descriptionLines = [`${texts.when}: ${when}`]
  if (where) descriptionLines.push(`${texts.where}: ${where}`)
  if (link) descriptionLines.push(`${texts.details}: ${link}`)
  const body = itemText(item)
  if (body) descriptionLines.push('', body)

  const lines: string[] = [
    el('title', feedItemTitle(item, texts.untitled, when)),
    el('link', absoluteUrl(`/i/${item.id}`, baseUrl)),
    el('guid', `urn:uuid:${item.id}`, ' isPermaLink="false"'),
    el('pubDate', rfc822(item.createdAt)),
    el('category', item.type),
    el('description', descriptionLines.join('\n')),
  ]

  const imagePath = enclosurePath(item)
  const media = imagePath ? input.media[imagePath] : undefined
  if (imagePath && media && media.mimeType) {
    lines.push(
      `<enclosure url="${escapeXml(absoluteUrl(imagePath, baseUrl))}" length="${Math.max(0, Math.trunc(media.size))}" type="${escapeXml(media.mimeType)}"/>`,
    )
  }

  lines.push(el('ev:startdate', startDateW3c(item.data)))
  if (schedule.endDate) lines.push(el('ev:enddate', schedule.endDate))
  if (where) lines.push(el('ev:location', where))
  lines.push(el('betel:startDate', schedule.startDate!))
  if (schedule.startTime) lines.push(el('betel:startTime', schedule.startTime))
  if (schedule.endDate) lines.push(el('betel:endDate', schedule.endDate))
  for (const slug of applicableSiteSlugs(item, feedSite)) {
    const name = sites.find(s => s.slug === slug)?.name ?? slug
    lines.push(el('betel:site', name, ` slug="${escapeXml(slug)}"`))
  }
  if (str(item.groupTitle)) lines.push(el('betel:group', item.groupTitle!))
  if (link) lines.push(el('betel:actionLink', link))

  return `    <item>\n${lines.map(l => `      ${l}`).join('\n')}\n    </item>`
}

/** RSS 2.0 document of current and upcoming events (deterministic, see header). */
export function buildEventFeed(input: FeedInput): string {
  const { baseUrl, site, texts } = input
  const channelLink = absoluteUrl(site ? `/${encodeURIComponent(site.slug)}` : '/', baseUrl)
  const channel = [
    el('title', texts.title),
    el('link', channelLink),
    el('description', texts.description),
    el('language', input.lang),
    el('generator', `Betel Info ${input.version}`),
    el('ttl', String(FEED_TTL_MINUTES)),
    `<image>\n      ${el('url', absoluteUrl('/icons/icon-512.png', baseUrl))}\n      ${el('title', texts.title)}\n      ${el('link', channelLink)}\n    </image>`,
    `<atom:link rel="self" type="application/rss+xml" href="${escapeXml(feedSelfUrl(input))}"/>`,
  ]
  const items = input.items.map(item => renderItem(item, input))
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rss version="2.0" xmlns:atom="${RSS_NAMESPACES.atom}" xmlns:ev="${RSS_NAMESPACES.ev}" xmlns:betel="${RSS_NAMESPACES.betel}">`,
    '  <channel>',
    ...channel.map(l => `    ${l}`),
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
