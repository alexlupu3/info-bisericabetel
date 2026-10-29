import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { shortLinks, contentItems, analyticsEvents } from '../db/schema.js'
import { isPreviewCrawler, renderPreviewHtml } from '../services/share-preview.js'
import { resolvePreview } from '../services/short-links.js'

// Deduplicate short-link click events: same IP+code within 10 min counts once
const CLICK_DEDUP_WINDOW_MS = 10 * 60 * 1000
const clickDedup = new Map<string, number>()
setInterval(() => {
  const cutoff = Date.now() - CLICK_DEDUP_WINDOW_MS
  for (const [key, ts] of clickDedup) {
    if (ts < cutoff) clickDedup.delete(key)
  }
}, 30 * 60 * 1000).unref()

// The public short-link redirect, or the link-preview page for crawlers (spec 06, ADR-025). The admin handlers live in
// routes/admin/short-links.ts on top of services/short-links.ts (spec 05).

// BR-012: a short link resolves at redirect time to the item's per-site link
// override, else its main link. Also used by services/short-links.ts for the
// informational `destination` of a newly created link.
export async function resolveUrl(contentItemId: string, siteSlug: string | null): Promise<string | null> {
  const [item] = await db
    .select({ data: contentItems.data })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
  if (!item) return null

  const data = item.data as Record<string, any>
  if (siteSlug) {
    const siteLinks = data.siteLinks as Record<string, string> | undefined
    return siteLinks?.[siteSlug] || data.link || null
  }
  return data.link || null
}

export async function shortLinkRedirectRoute(app: FastifyInstance) {
  app.get<{ Params: { code: string }; Querystring: { lang?: string; preview?: string } }>('/s/:code', async (req, reply) => {
    // Every branch below inherits it: preview page, 302 to the destination, 302 / (FR-088).
    reply.header('X-Robots-Tag', 'noindex')
    // A preview request never counts as a click nor touches the dedup map, on any branch.
    const preview = isPreviewCrawler(req.headers['user-agent']) || req.query.preview === '1'

    const [link] = await db
      .select()
      .from(shortLinks)
      .where(eq(shortLinks.code, req.params.code))

    if (!link) return reply.header('Cache-Control', 'no-store').redirect('/', 302)

    if (preview && link.previewMode === 'content') {
      const meta = await resolvePreview(link, {
        lang: req.query.lang,
        acceptLanguage: req.headers['accept-language'],
      })
      if (meta.willPreview) {
        return reply
          .type('text/html; charset=utf-8')
          .header('Cache-Control', 'public, max-age=300')
          .header('Vary', 'User-Agent, Accept-Language')
          .send(renderPreviewHtml(meta))
      }
    }

    const url = await resolveUrl(link.contentItemId, link.siteSlug)

    if (!preview) {
      // Fire-and-forget: log the click, deduplicated per IP+code within 10 min
      const dedupKey = `${req.ip}:${link.code}`
      const now = Date.now()
      const lastClick = clickDedup.get(dedupKey)
      if (!lastClick || now - lastClick >= CLICK_DEDUP_WINDOW_MS) {
        clickDedup.set(dedupKey, now)
        db.insert(analyticsEvents).values({
          eventType:   'link_click',
          siteSlug:    link.siteSlug ?? undefined,
          itemId:      link.contentItemId,
          url:         url ?? undefined,
          shortLinkId: link.id,
        }).catch(() => {})
      }
    }

    return reply.header('Cache-Control', 'no-store').redirect(url ?? '/', 302)
  })
}
