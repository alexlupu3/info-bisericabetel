import { randomBytes } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { db, sql } from '../db/client.js'
import { shortLinks, contentItems, analyticsEvents } from '../db/schema.js'

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

function generateCode(length = 6): string {
  const bytes = randomBytes(length)
  return Array.from(bytes).map(b => CHARS[b % CHARS.length]).join('')
}

async function resolveUrl(contentItemId: string, siteSlug: string | null): Promise<string | null> {
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
  app.get<{ Params: { code: string } }>('/s/:code', async (req, reply) => {
    const [link] = await db
      .select()
      .from(shortLinks)
      .where(eq(shortLinks.code, req.params.code))

    if (!link) return reply.redirect('/', 302)

    const url = await resolveUrl(link.contentItemId, link.siteSlug)

    // Fire-and-forget: log the click
    db.insert(analyticsEvents).values({
      eventType:   'link_click',
      itemId:      link.contentItemId,
      url:         url ?? undefined,
      shortLinkId: link.id,
    }).catch(() => {})

    return reply.redirect(url ?? '/', 302)
  })
}

function adminOnly(req: any, reply: any, done: any) {
  const role = (req.user as any)?.role
  if (role !== 'admin' && role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminShortLinksRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, adminOnly]

  app.get<{ Params: { id: string } }>(
    '/admin/content/:id/short-links', { preHandler: auth }, async (req) => {
      const rows = await sql<{
        id: string
        code: string
        label: string
        content_item_id: string
        site_slug: string | null
        created_at: Date
        click_count: string
      }>`
        SELECT
          sl.id,
          sl.code,
          sl.label,
          sl.content_item_id,
          sl.site_slug,
          sl.created_at,
          COUNT(ae.id)::int AS click_count
        FROM short_links sl
        LEFT JOIN analytics_events ae
          ON ae.short_link_id = sl.id
        WHERE sl.content_item_id = ${req.params.id}
        GROUP BY sl.id
        ORDER BY sl.created_at DESC
      `

      return {
        shortLinks: rows.map((r: any) => ({
          id:            r.id,
          code:          r.code,
          label:         r.label,
          contentItemId: r.content_item_id,
          siteSlug:      r.site_slug,
          createdAt:     r.created_at,
          clickCount:    Number(r.click_count),
        })),
      }
    }
  )

  app.post<{ Params: { id: string }; Body: { label: string; siteSlug?: string | null } }>(
    '/admin/content/:id/short-links', { preHandler: auth }, async (req, reply) => {
      const { label, siteSlug = null } = req.body
      if (!label?.trim()) return reply.code(400).send({ error: 'label is required' })

      // Verify the content item exists
      const [item] = await db
        .select({ id: contentItems.id })
        .from(contentItems)
        .where(eq(contentItems.id, req.params.id))
      if (!item) return reply.code(404).send({ error: 'Content item not found' })

      // Generate a unique code (retry on collision)
      let code: string
      let attempts = 0
      while (true) {
        code = generateCode()
        const existing = await db
          .select({ id: shortLinks.id })
          .from(shortLinks)
          .where(eq(shortLinks.code, code))
        if (existing.length === 0) break
        if (++attempts > 10) return reply.code(500).send({ error: 'Could not generate unique code' })
      }

      const userId = (req.user as any)?.id ?? null

      const [created] = await db.insert(shortLinks).values({
        code,
        label:         label.trim(),
        contentItemId: req.params.id,
        siteSlug:      siteSlug || null,
        createdBy:     userId,
      }).returning()

      return reply.code(201).send({ ...created, clickCount: 0 })
    }
  )

  app.delete<{ Params: { id: string; shortLinkId: string } }>(
    '/admin/content/:id/short-links/:shortLinkId', { preHandler: auth }, async (req, reply) => {
      const deleted = await db
        .delete(shortLinks)
        .where(and(
          eq(shortLinks.id, req.params.shortLinkId),
          eq(shortLinks.contentItemId, req.params.id),
        ))
        .returning({ id: shortLinks.id })

      if (deleted.length === 0) return reply.code(404).send({ error: 'Short link not found' })
      return reply.code(204).send()
    }
  )
}
