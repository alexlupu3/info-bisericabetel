// Short-link creation, listing and deletion (spec 05 §6.5, FR-083, BR-041), shared by
// the admin REST handlers (routes/admin/short-links.ts) and the remote MCP endpoint.
// The public redirect `/s/:code` stays in routes/short-links.ts (spec 06).

import { randomInt } from 'crypto'
import type { CreatedShortLink, ShortLinkWithUrl } from '@betel/shared'
import { and, eq } from 'drizzle-orm'
import { db, sql } from '../db/client.js'
import { shortLinks } from '../db/schema.js'
import { logAudit } from '../db/audit.js'
import { resolveUrl } from '../routes/short-links.js'
import { absoluteUrl } from './public-url.js'
import { isUuid, NotFoundError, ValidationError } from './errors.js'
import { parseLimit } from './analytics-range.js'

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const CODE_LENGTH = 6
const MAX_CODE_ATTEMPTS = 10
const LABEL_MAX = 100
const LIST_DEFAULT = 100
const LIST_MAX = 500

export const NO_LINK_WARNING = 'the item has no link; the short link redirects to / until one is set'

export interface ShortLinkActor {
  userId?: string | null
  userEmail: string
  via: 'admin' | 'mcp'
}

/** The public URL of a short link: PUBLIC_BASE_URL + /s/<code>. */
export function shortLinkUrl(code: string): string {
  return absoluteUrl(`/s/${code}`)
}

function generateCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CHARS[randomInt(0, CHARS.length)]).join('')
}

// PostgreSQL unique violation, possibly wrapped by drizzle (DrizzleQueryError.cause).
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null
  return err?.code === '23505' || err?.cause?.code === '23505'
}

async function assertSiteExists(slug: string): Promise<void> {
  const [row] = await sql`SELECT 1 FROM sites WHERE slug = ${slug}`
  if (!row) throw new ValidationError(`site "${slug}" not found`)
}

export async function createShortLink(
  input: { contentItemId: string; label: string; siteSlug?: string | null },
  actor: ShortLinkActor,
): Promise<CreatedShortLink> {
  const label = typeof input.label === 'string' ? input.label.trim() : ''
  if (label.length < 1 || label.length > LABEL_MAX) throw new ValidationError('label is required (1–100 characters)')

  const notFound = new NotFoundError(`content item "${input.contentItemId}" not found`)
  if (!isUuid(input.contentItemId)) throw notFound
  const [item] = await sql<{ id: string; title: string | null }[]>`
    SELECT id, data->>'title' AS title FROM content_items
    WHERE id = ${input.contentItemId} AND state <> 'deleted'
  `
  if (!item) throw notFound

  const siteSlug = input.siteSlug || null
  if (siteSlug) await assertSiteExists(siteSlug)

  // Race-safe: insert and retry on a unique violation instead of select-then-insert.
  let created: typeof shortLinks.$inferSelect | undefined
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !created; attempt++) {
    try {
      ;[created] = await db.insert(shortLinks).values({
        code: generateCode(),
        label,
        contentItemId: item.id,
        siteSlug,
        createdBy: actor.userId ?? null,
      }).returning()
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
    }
  }
  if (!created) throw new Error('could not generate a unique short link code, try again')

  await logAudit({
    userId: actor.userId ?? undefined,
    userEmail: actor.userEmail,
    action: 'short-link.create',
    entityType: 'short_link',
    entityId: created.id,
    detail: { code: created.code, label, contentItemId: item.id, siteSlug, via: actor.via },
  })

  const destination = await resolveUrl(item.id, siteSlug)
  return {
    id: created.id,
    code: created.code,
    label: created.label,
    contentItemId: created.contentItemId,
    siteSlug: created.siteSlug,
    createdAt: created.createdAt.toISOString(),
    clickCount: 0,
    url: shortLinkUrl(created.code),
    itemTitle: item.title,
    destination,
    ...(destination === null && { warning: NO_LINK_WARNING }),
  }
}

export async function listShortLinks(
  filter: { contentItemId?: string; siteSlug?: string; limit?: number | string },
): Promise<ShortLinkWithUrl[]> {
  const contentItemId = filter.contentItemId || undefined
  const siteSlug = filter.siteSlug || undefined
  const limit = parseLimit(filter.limit, LIST_DEFAULT, LIST_MAX)
  if (contentItemId && !isUuid(contentItemId)) throw new NotFoundError(`content item "${contentItemId}" not found`)
  if (siteSlug) await assertSiteExists(siteSlug)

  const rows = await sql<{
    id: string; code: string; label: string; content_item_id: string; site_slug: string | null
    created_at: string; item_title: string | null; click_count: number
  }[]>`
    -- created_at as ISO 8601 text: the shared client returns timestamps as strings (drizzle parsers)
    SELECT sl.id, sl.code, sl.label, sl.content_item_id, sl.site_slug,
           to_char(sl.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
           ci.data->>'title' AS item_title,
           (SELECT COUNT(*)::int FROM analytics_events ae WHERE ae.short_link_id = sl.id) AS click_count
    FROM short_links sl
    JOIN content_items ci ON ci.id = sl.content_item_id
    WHERE TRUE
      ${contentItemId ? sql`AND sl.content_item_id = ${contentItemId}` : sql``}
      ${siteSlug ? sql`AND sl.site_slug = ${siteSlug}` : sql``}
    ORDER BY sl.created_at DESC, sl.id
    LIMIT ${limit}
  `

  return rows.map(r => ({
    id: r.id,
    code: r.code,
    label: r.label,
    contentItemId: r.content_item_id,
    siteSlug: r.site_slug,
    createdAt: r.created_at,
    clickCount: r.click_count,
    url: shortLinkUrl(r.code),
    itemTitle: r.item_title,
  }))
}

/** Deletes a short link of an item; false when it does not exist. REST only (no MCP tool, Q1). */
export async function deleteShortLink(id: string, contentItemId: string, actor: ShortLinkActor): Promise<boolean> {
  if (!isUuid(id) || !isUuid(contentItemId)) return false
  const [deleted] = await db.delete(shortLinks)
    .where(and(eq(shortLinks.id, id), eq(shortLinks.contentItemId, contentItemId)))
    .returning()
  if (!deleted) return false

  await logAudit({
    userId: actor.userId ?? undefined,
    userEmail: actor.userEmail,
    action: 'short-link.delete',
    entityType: 'short_link',
    entityId: deleted.id,
    detail: { code: deleted.code, label: deleted.label, contentItemId, via: actor.via },
  })
  return true
}
