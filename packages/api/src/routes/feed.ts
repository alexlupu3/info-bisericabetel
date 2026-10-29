// RSS 2.0 feeds of current and upcoming events (spec 02 FR-060 – FR-064, ADR-021):
// GET /feed.xml (all-sites view) and GET /:siteSlug/feed.xml (one site), outside /api.
// Item selection is the hub's own query (listPublicContent) narrowed by
// selectUpcomingEvents, so the feed can never show what the hub hides (BR-025).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { languages, media } from '../db/schema.js'
import { DEFAULT_LOCALE, listPublicContent, selectUpcomingEvents } from '../services/public-content.js'
import { publicBaseUrl } from '../services/public-url.js'
import { interpolate, loadFeedStrings, resolveFeedStrings } from '../services/feed-strings.js'
import { dateLocaleFor } from '../services/locale.js'
import { buildEventFeed, enclosurePath, type FeedMedia, type FeedSite } from '../services/rss.js'
import { loadSites } from '../services/seo/page-data.js'
import { etagMatches, strongEtag } from '../services/seo/cache.js'
import { escapeHtml } from '../services/seo/escape.js'
import { registerHeadTags } from '../services/seo/head-tags.js'

/** `public, max-age=300`: equals `<ttl>5</ttl>` (FR-063). */
export const FEED_CACHE_CONTROL = 'public, max-age=300'
export const FEED_RATE_LIMIT = { rateLimit: { max: 120, timeWindow: '1 minute' } }

const FEED_LIMIT = 100

/**
 * Sends a deterministic text body with a strong ETag and the feed's Cache-Control,
 * answering a matching If-None-Match with 304 (shared by the feeds and /llms.txt).
 */
export function sendCacheable(req: FastifyRequest, reply: FastifyReply, body: string, contentType: string) {
  const etag = strongEtag(body)
  reply.type(contentType).header('Cache-Control', FEED_CACHE_CONTROL).header('ETag', etag)
  if (etagMatches(req.headers['if-none-match'], etag)) return reply.code(304).send()
  return reply.send(body)
}

function plain(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).type('text/plain; charset=utf-8').header('Cache-Control', 'no-cache').send(message)
}

/** The enabled language `lang` names, `DEFAULT_LOCALE` when absent; null when invalid. */
async function resolveLang(raw: unknown): Promise<string | null> {
  if (raw === undefined) return DEFAULT_LOCALE
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const code = raw.trim()
  if (code === DEFAULT_LOCALE) return code
  const [row] = await db.select({ code: languages.code }).from(languages)
    .where(and(eq(languages.code, code), eq(languages.enabled, true)))
  return row ? row.code : null
}

/** `media` rows of the items' original images, by exact stored URL (§6.5.1). */
async function loadMedia(paths: string[]): Promise<Record<string, FeedMedia>> {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return {}
  const rows = await db.select({ url: media.url, size: media.size, mimeType: media.mimeType })
    .from(media).where(inArray(media.url, unique))
  return Object.fromEntries(rows.map(r => [r.url, { size: r.size, mimeType: r.mimeType }]))
}

/** Per-site `<link rel="alternate">` for server-rendered `/:siteSlug` pages (FR-064(a)). */
export function siteFeedHeadTag(site: { slug: string; name: string }): string {
  const title = interpolate(resolveFeedStrings()['feed.title.site'], { siteName: site.name })
  const href = `/${encodeURIComponent(site.slug)}/feed.xml`
  return `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(title)}" href="${escapeHtml(href)}">`
}

export async function feedRoutes(app: FastifyInstance, opts: { version: string }) {
  // The static all-sites link lives in index.html; site pages add their own feed next to it.
  registerHeadTags(page => (page.kind === 'site' && page.site ? [siteFeedHeadTag(page.site)] : []))

  async function serveFeed(req: FastifyRequest<{ Querystring: { lang?: unknown } }>, reply: FastifyReply, siteSlug: string | null) {
    const allSites = await loadSites()
    let site: FeedSite | null = null
    if (siteSlug !== null) {
      site = allSites.find(s => s.slug === siteSlug) ?? null
      if (!site) return plain(reply, 404, 'Unknown site')
    }
    const lang = await resolveLang(req.query.lang)
    if (!lang) return plain(reply, 400, 'Unknown or disabled language')

    const [visible, strings] = await Promise.all([
      listPublicContent({ site: siteSlug, locale: lang }),
      loadFeedStrings(lang),
    ])
    const items = selectUpcomingEvents(visible, FEED_LIMIT)
    const mediaRows = await loadMedia(items.map(enclosurePath).filter((p): p is string => p !== null))

    const vars = { siteName: site?.name ?? '' }
    const body = buildEventFeed({
      baseUrl: publicBaseUrl(),
      site,
      lang,
      isDefaultLang: lang === DEFAULT_LOCALE,
      dateLocale: dateLocaleFor(lang),
      texts: {
        title: interpolate(site ? strings['feed.title.site'] : strings['feed.title'], vars),
        description: interpolate(site ? strings['feed.description.site'] : strings['feed.description'], vars),
        when: strings['feed.when'],
        where: strings['feed.where'],
        details: strings['feed.details'],
        untitled: strings['feed.untitled'],
      },
      version: opts.version,
      sites: allSites,
      items,
      media: mediaRows,
    })
    return sendCacheable(req, reply, body, 'application/rss+xml; charset=utf-8')
  }

  app.get<{ Querystring: { lang?: unknown } }>('/feed.xml', { config: FEED_RATE_LIMIT }, (req, reply) =>
    serveFeed(req, reply, null))

  // `/admin/feed.xml` resolves to siteSlug "admin", which is not a site → 404 (not special-cased).
  app.get<{ Params: { siteSlug: string }; Querystring: { lang?: unknown } }>(
    '/:siteSlug/feed.xml', { config: FEED_RATE_LIMIT }, (req, reply) => serveFeed(req, reply, req.params.siteSlug))
}
