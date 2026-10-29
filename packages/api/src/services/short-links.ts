// Short-link creation, listing and deletion (spec 05 §6.5, FR-083, BR-041), shared by
// the admin REST handlers (routes/admin/short-links.ts) and the remote MCP endpoint.
// The public redirect `/s/:code` stays in routes/short-links.ts (spec 06); its preview
// metadata is loaded here (resolvePreview) and built by services/share-preview.ts.

import { randomInt } from 'crypto'
import type { CreatedShortLink, ShortLinkPreview, ShortLinkPreviewMode, ShortLinkWithUrl } from '@betel/shared'
import { SHORT_LINK_PREVIEW_MODES } from '@betel/shared'
import { and, eq } from 'drizzle-orm'
import { db, sql } from '../db/client.js'
import { contentItems, contentTranslations, languages, shortLinks, sites } from '../db/schema.js'
import { logAudit } from '../db/audit.js'
import { resolveUrl } from '../routes/short-links.js'
import { absoluteUrl } from './public-url.js'
import { isUuid, NotFoundError, ValidationError } from './errors.js'
import { parseLimit } from './analytics-range.js'
import { buildPreview, pickLocale, type PreviewInput } from './share-preview.js'
import { DEFAULT_LOCALE } from './locale.js'
import { ensureOgImage, OG_HEIGHT, OG_WIDTH, type OgImage } from './og-image.js'
import { brandDerivativePath, itemImageUrl, ogDerivativePath } from './preview-image.js'
import { seoConfig } from './seo/organization.js'

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

/** `previewMode` input (spec 06 FR-089): undefined/null → default, else one of the modes. */
function parsePreviewMode(value: unknown): ShortLinkPreviewMode | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' && (SHORT_LINK_PREVIEW_MODES as readonly string[]).includes(value)) {
    return value as ShortLinkPreviewMode
  }
  throw new ValidationError('previewMode must be "content" or "destination"')
}

async function assertSiteExists(slug: string): Promise<void> {
  const [row] = await sql`SELECT 1 FROM sites WHERE slug = ${slug}`
  if (!row) throw new ValidationError(`site "${slug}" not found`)
}

export async function createShortLink(
  input: { contentItemId: string; label: string; siteSlug?: string | null; previewMode?: unknown },
  actor: ShortLinkActor,
): Promise<CreatedShortLink> {
  const label = typeof input.label === 'string' ? input.label.trim() : ''
  if (label.length < 1 || label.length > LABEL_MAX) throw new ValidationError('label is required (1–100 characters)')
  const previewMode = parsePreviewMode(input.previewMode) ?? 'content'

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
        previewMode,
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
    detail: { code: created.code, label, contentItemId: item.id, siteSlug, previewMode, via: actor.via },
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
    previewMode: created.previewMode,
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
    created_at: string; item_title: string | null; click_count: number; preview_mode: ShortLinkPreviewMode
  }[]>`
    -- created_at as ISO 8601 text: the shared client returns timestamps as strings (drizzle parsers)
    SELECT sl.id, sl.code, sl.label, sl.content_item_id, sl.site_slug, sl.preview_mode,
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
    previewMode: r.preview_mode,
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

async function findShortLink(id: string, contentItemId: string) {
  if (!isUuid(id) || !isUuid(contentItemId)) return undefined
  const [link] = await db.select().from(shortLinks)
    .where(and(eq(shortLinks.id, id), eq(shortLinks.contentItemId, contentItemId)))
  return link
}

/** Changes a short link's preview mode (spec 06 FR-089); null when it does not exist under the item. */
export async function updateShortLinkPreviewMode(
  id: string,
  contentItemId: string,
  previewMode: unknown,
  actor: ShortLinkActor,
): Promise<ShortLinkWithUrl | null> {
  const mode = parsePreviewMode(previewMode)
  if (!mode) throw new ValidationError('previewMode must be "content" or "destination"')
  const link = await findShortLink(id, contentItemId)
  if (!link) return null

  if (link.previewMode !== mode) {
    await db.update(shortLinks).set({ previewMode: mode }).where(eq(shortLinks.id, link.id))
    await logAudit({
      userId: actor.userId ?? undefined,
      userEmail: actor.userEmail,
      action: 'short-link.update',
      entityType: 'short_link',
      entityId: link.id,
      detail: { code: link.code, previewMode: { from: link.previewMode, to: mode }, via: actor.via },
    })
  }
  const [row] = (await listShortLinks({ contentItemId, limit: LIST_MAX })).filter(l => l.id === link.id)
  return row ?? null
}

/** The resolved link preview of a short link in `locale` (spec 06 FR-089); null when not found. */
export async function getShortLinkPreview(
  id: string,
  contentItemId: string,
  locale?: string,
): Promise<ShortLinkPreview | null> {
  const link = await findShortLink(id, contentItemId)
  if (!link) return null
  // The default language is the bare short URL; other languages get `?lang=` (§6.4).
  const lang = locale && locale !== DEFAULT_LOCALE ? locale : undefined
  return resolvePreview(link, { lang })
}

// --- Link previews (spec 06, FR-086) ---------------------------------------

export interface PreviewLink {
  code: string
  contentItemId: string
  siteSlug: string | null
  previewMode: ShortLinkPreviewMode
}

export async function enabledLanguageCodes(): Promise<string[]> {
  const rows = await db.select({ code: languages.code }).from(languages).where(eq(languages.enabled, true))
  return rows.map(r => r.code)
}

async function loadItem(contentItemId: string, locale: string): Promise<PreviewInput['item']> {
  const [item] = await db.select({ type: contentItems.type, data: contentItems.data })
    .from(contentItems).where(eq(contentItems.id, contentItemId))
  if (!item) return null
  let translated: Record<string, unknown> = {}
  if (locale !== DEFAULT_LOCALE) {
    const [row] = await db.select({ data: contentTranslations.data }).from(contentTranslations)
      .where(and(eq(contentTranslations.contentItemId, contentItemId), eq(contentTranslations.locale, locale)))
    translated = (row?.data as Record<string, unknown>) ?? {}
  }
  return { type: item.type, data: { ...(item.data as Record<string, unknown>), ...translated } }
}

async function derivative(path: string | null): Promise<OgImage | null> {
  if (!path) return null
  try {
    return await ensureOgImage(path.slice('/uploads/og/'.length))
  } catch (e) {
    console.error(`share-preview: could not build ${path}`, e)
    return null
  }
}

/**
 * Loads everything a preview needs and builds it (FR-086). `request` carries the
 * crawler's `?lang` and `Accept-Language`; the admin endpoint passes `lang` only.
 * Generates the image derivatives on first use, so og:image:width/height are real.
 */
export async function resolvePreview(
  link: PreviewLink,
  request: { lang?: unknown; acceptLanguage?: string },
): Promise<ShortLinkPreview> {
  const { locale, langParam } = pickLocale({ ...request, enabled: await enabledLanguageCodes() })
  const [item, siteRow, destination] = await Promise.all([
    loadItem(link.contentItemId, locale),
    link.siteSlug
      ? db.select({ name: sites.name, accent: sites.accent }).from(sites).where(eq(sites.slug, link.siteSlug)).then(r => r[0] ?? null)
      : Promise.resolve(null),
    resolveUrl(link.contentItemId, link.siteSlug),
  ])

  const upload = item ? itemImageUrl(item.type, item.data) : null
  const brandPath = brandDerivativePath(siteRow?.accent ?? null)
  const [itemImage, brand] = await Promise.all([
    derivative(upload ? ogDerivativePath(upload) : null),
    derivative(brandPath),
  ])

  return buildPreview({
    code: link.code,
    mode: link.previewMode,
    item,
    site: siteRow,
    locale,
    langParam,
    destination,
    hubName: seoConfig().orgName,
    itemImage,
    brandImage: brand ?? { name: brandPath.slice('/uploads/og/'.length), width: OG_WIDTH, height: OG_HEIGHT },
  })
}
