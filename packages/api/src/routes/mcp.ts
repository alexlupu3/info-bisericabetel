import { randomUUID, timingSafeEqual } from 'crypto'
import { promises as fsp } from 'fs'
import { join } from 'path'
import type { FastifyInstance } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { db } from '../db/client.js'
import { contentItems, groups, sites, media } from '../db/schema.js'
import { logAudit } from '../db/audit.js'
import { scheduleContentTranslation } from '../services/ai-translation.js'
import { resortGroupChronologically } from '../services/group-order.js'
import { getAnalyticsOverview, getItemStats, getShortLinkStats, getTopItems } from '../services/analytics-stats.js'
import { createShortLink, listShortLinks } from '../services/short-links.js'
import { isServiceError } from '../services/errors.js'
import { invalidContentData } from '../services/content-validation.js'
import { toolContract, toolNames, type ToolHandlers, type ToolResult } from '@betel/shared/mcp-tools'

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), '..', 'uploads')
const MAX_WIDTH = 1980
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
// upload_media sends the image base64-encoded inside a JSON-RPC body: 5 MB of image data
// is ~6.7 MB of base64 (4/3 overhead), plus the envelope. A reverse proxy in front
// (e.g. CapRover's nginx) must allow at least this much.
const MCP_BODY_LIMIT = 8 * 1024 * 1024

const MCP_ACTOR = 'mcp@betel'

const sessions = new Map<string, StreamableHTTPServerTransport>()

function err(msg: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: msg }] }
}

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

// Runs a service call; service errors (validation, not found, bad range) become tool
// errors with the same message the REST API returns (spec 05 §6.8).
async function viaService(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn())
  } catch (e) {
    if (isServiceError(e)) return err(e.message)
    throw e
  }
}

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'betel-mcp', version: '1.0.0' })

  const handlers: ToolHandlers = {
    // ── list_sites ──────────────────────────────────────────────
    list_sites: async () => ok(await db.select().from(sites)),

    // ── list_groups ─────────────────────────────────────────────
    list_groups: async () => ok(
      await db.select().from(groups)
        .where(ne(groups.state, 'deleted'))
        .orderBy(asc(groups.orderPosition)),
    ),

    // ── list_media ──────────────────────────────────────────────
    list_media: async () => ok(await db.select().from(media)),

    // ── upload_media ────────────────────────────────────────────
    upload_media: async ({ imageData, filename, mimeType }) => {
      // The image is converted to WebP by sharp; mimeType is only checked, as on stdio.
      if (mimeType !== undefined && !mimeType.startsWith('image/')) {
        return err(`Unsupported mimeType "${mimeType}". Only image/* types are accepted.`)
      }
      let inputBuffer: Buffer
      try {
        inputBuffer = Buffer.from(imageData, 'base64')
      } catch {
        return err('imageData is not valid base64')
      }

      if (inputBuffer.byteLength > MAX_UPLOAD_BYTES) {
        return err(`Image exceeds the 5 MB limit (decoded size: ${inputBuffer.byteLength} bytes)`)
      }

      await fsp.mkdir(UPLOADS_DIR, { recursive: true })
      const outFilename = `${randomUUID()}.webp`
      const dest = join(UPLOADS_DIR, outFilename)

      try {
        await sharp(inputBuffer)
          .rotate()
          .resize({ width: MAX_WIDTH, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(dest)
      } catch (e: any) {
        return err(`Failed to process image: ${e.message}`)
      }

      const { size } = (await fsp.stat(dest))
      const url = `/uploads/${outFilename}`
      const [row] = await db.insert(media).values({
        url,
        filename: outFilename,
        originalName: filename ?? 'upload',
        size,
        mimeType: 'image/webp',
      }).returning()

      await logAudit({
        userEmail:  MCP_ACTOR,
        action:     'media.upload',
        entityType: 'media',
        entityId:   row.id,
        detail:     { via: 'mcp', originalName: filename ?? 'upload' },
      })

      return ok(row)
    },

    // ── list_cards ──────────────────────────────────────────────
    list_cards: async () => ok(
      await db.select().from(contentItems)
        .where(and(eq(contentItems.type, 'card'), ne(contentItems.state, 'deleted')))
        .orderBy(asc(contentItems.orderPosition)),
    ),

    // ── create_card ─────────────────────────────────────────────
    create_card: async ({ title, description, thumbnail, startDate, endDate, startTime, link, cta,
             sites: sitesList, exclusiveSite, groupId }) => {
      const normalizedExclusive = exclusiveSite?.length ? exclusiveSite : null
      if (normalizedExclusive) {
        const [row] = await db.select({ slug: sites.slug }).from(sites).where(eq(sites.slug, normalizedExclusive))
        if (!row) return err(`invalid exclusiveSite "${normalizedExclusive}"`)
      }

      const data: Record<string, unknown> = { title }
      if (description !== undefined) data.description = description
      if (thumbnail  !== undefined) data.thumbnail    = thumbnail
      if (startDate  !== undefined) data.startDate    = startDate
      if (endDate    !== undefined) data.endDate      = endDate
      if (startTime  !== undefined) data.startTime    = startTime
      if (link       !== undefined) data.link         = link
      if (cta        !== undefined) data.cta          = cta
      // Same rules as POST /api/admin/content: required title, date order, start time.
      const dataError = invalidContentData('card', data)
      if (dataError) return err(dataError)

      const item = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(1001)`)
        const [{ max }] = await tx.select({ max: sql<number>`COALESCE(MAX(order_position), -1)` })
          .from(contentItems)
        const [row] = await tx.insert(contentItems).values({
          type:          'card',
          sites:         normalizedExclusive ? [] : (sitesList ?? []),
          exclusiveSite: normalizedExclusive,
          groupId:       groupId ?? null,
          data,
          orderPosition: max + 1,
          state:         'draft',
        }).returning()
        return row
      })

      // BR-013: same chronological re-sort as POST /api/admin/content.
      let orderPosition = item.orderPosition
      if (groupId) orderPosition = (await resortGroupChronologically(groupId, item.id)) ?? item.orderPosition

      await logAudit({
        userEmail: MCP_ACTOR,
        action:    'content.create',
        entityId:  item.id,
        detail:    { type: 'card', via: 'mcp', exclusiveSite: normalizedExclusive },
      })
      scheduleContentTranslation(item.id, data)

      return ok({ ...item, orderPosition })
    },

    // ── update_card ─────────────────────────────────────────────
    update_card: async ({ id, title, description, thumbnail, startDate, endDate, startTime, link, cta,
             sites: sitesList, exclusiveSite }) => {
      const [existing] = await db.select().from(contentItems)
        .where(and(eq(contentItems.id, id), eq(contentItems.type, 'card'), ne(contentItems.state, 'deleted')))
      if (!existing) return err(`card "${id}" not found or is not an active card`)

      const exclusiveProvided = exclusiveSite !== undefined
      const normalizedExclusive = exclusiveProvided
        ? (exclusiveSite?.length ? exclusiveSite : null)
        : existing.exclusiveSite

      if (exclusiveProvided && normalizedExclusive) {
        const [row] = await db.select({ slug: sites.slug }).from(sites).where(eq(sites.slug, normalizedExclusive!))
        if (!row) return err(`invalid exclusiveSite "${normalizedExclusive}"`)
      }

      // Clearing exclusiveSite requires the caller to also specify sites[]
      const clearingExclusive = exclusiveProvided && normalizedExclusive === null && existing.exclusiveSite !== null
      if (clearingExclusive && sitesList === undefined) {
        return err('sites is required when clearing exclusiveSite')
      }

      const sitesPatch = normalizedExclusive !== null
        ? { sites: [] as string[] }
        : (sitesList !== undefined ? { sites: sitesList } : undefined)

      const dataFields: Record<string, unknown> = {}
      if (title       !== undefined) dataFields.title       = title
      if (description !== undefined) dataFields.description = description
      if (thumbnail   !== undefined) dataFields.thumbnail   = thumbnail
      if (startDate   !== undefined) dataFields.startDate   = startDate
      if (endDate     !== undefined) dataFields.endDate     = endDate
      if (startTime   !== undefined) dataFields.startTime   = startTime
      if (link        !== undefined) dataFields.link        = link
      if (cta         !== undefined) dataFields.cta         = cta

      // Merge over the stored data; a null value removes the key (PATCH semantics).
      const hasDataChanges = Object.keys(dataFields).length > 0
      const mergedData: Record<string, unknown> = { ...(existing.data as Record<string, unknown>) }
      for (const [k, v] of Object.entries(dataFields)) {
        if (v === null) delete mergedData[k]
        else mergedData[k] = v
      }
      // Validate the resulting data exactly like PATCH /api/admin/content/:id: a non-empty
      // title, a non-reversed date range and no time on a multi-day or undated card.
      const dataError = invalidContentData('card', mergedData)
      if (dataError) return err(dataError)

      const [updated] = await db.update(contentItems).set({
        ...(hasDataChanges && { data: mergedData }),
        ...(sitesPatch ?? {}),
        ...(exclusiveProvided && { exclusiveSite: normalizedExclusive }),
        updatedAt: new Date(),
      }).where(and(eq(contentItems.id, id), eq(contentItems.type, 'card'), ne(contentItems.state, 'deleted'))).returning()

      await logAudit({
        userEmail: MCP_ACTOR,
        action:    'content.update',
        entityId:  id,
        detail:    { via: 'mcp', ...(exclusiveProvided ? { exclusiveSite: normalizedExclusive } : {}) },
      })

      if (hasDataChanges) {
        const oldData = (existing.data ?? {}) as Record<string, unknown>
        const changedKeys = Object.keys(dataFields).filter(
          k => dataFields[k] !== null && JSON.stringify(oldData[k]) !== JSON.stringify(dataFields[k]),
        )
        if (changedKeys.length > 0) {
          scheduleContentTranslation(id, mergedData, changedKeys)
        }
      }

      return ok(updated)
    },

    // ── publish_card ────────────────────────────────────────────
    publish_card: async ({ id }) => {
      const [existing] = await db.select({ id: contentItems.id, type: contentItems.type, state: contentItems.state })
        .from(contentItems).where(eq(contentItems.id, id))
      if (!existing) return err(`card "${id}" not found`)
      if (existing.type !== 'card') return err(`item "${id}" is not a card`)
      if (existing.state !== 'draft') return err(`card "${id}" is not a draft (current state: ${existing.state})`)

      const [updated] = await db.update(contentItems)
        .set({ state: 'published', updatedAt: new Date() })
        .where(and(eq(contentItems.id, id), eq(contentItems.type, 'card'), eq(contentItems.state, 'draft')))
        .returning()

      await logAudit({ userEmail: MCP_ACTOR, action: 'content.publish', entityId: id, detail: { via: 'mcp' } })

      return ok(updated)
    },

    // ── Analytics and short links (spec 05): adapters over the services ──

    get_analytics_overview: async (args) => viaService(() => getAnalyticsOverview(args)),
    get_item_stats: async (args) => viaService(() => getItemStats(args)),
    get_top_items: async (args) => viaService(() => getTopItems(args)),
    get_short_link_stats: async (args) => viaService(() => getShortLinkStats(args)),
    create_short_link: async ({ itemId, label, siteSlug }) => viaService(() =>
      createShortLink({ contentItemId: itemId, label, siteSlug }, { userEmail: MCP_ACTOR, via: 'mcp' })),
    list_short_links: async ({ itemId, site, limit }) => viaService(async () =>
      ({ shortLinks: await listShortLinks({ contentItemId: itemId, siteSlug: site, limit }) })),
  }

  // A tool exists on both surfaces or on neither: register every contract entry (ADR-024).
  for (const name of toolNames) {
    const tool = toolContract[name]
    server.registerTool(
      name,
      { description: tool.description, inputSchema: tool.input, annotations: tool.annotations },
      handlers[name] as never,
    )
  }

  return server
}

// ──────────────────────────────────────────────────────────────────────────────
// Fastify plugin
// ──────────────────────────────────────────────────────────────────────────────

export async function mcpRoutes(app: FastifyInstance) {
  const MCP_SECRET = process.env.MCP_SECRET
  if (!MCP_SECRET) {
    app.log.info('MCP_SECRET not configured — /mcp endpoint disabled')
    return
  }

  // Constant-time comparison of the bearer header (FR-084).
  const expected = Buffer.from(`Bearer ${MCP_SECRET}`)
  function authorized(header: unknown): boolean {
    if (typeof header !== 'string') return false
    const given = Buffer.from(header)
    if (given.length !== expected.length) {
      timingSafeEqual(expected, expected) // keep the work similar for mismatched lengths
      return false
    }
    return timingSafeEqual(given, expected)
  }

  function requireAuth(req: any, reply: any, done: any) {
    if (!authorized(req.headers.authorization)) {
      reply.code(401).send({ error: 'Unauthorized' })
      return
    }
    done()
  }

  // POST: initialise a new session or resume an existing one
  // Rate limit runs before auth (onRequest), so guessing the secret is throttled too.
  app.post('/mcp', {
    preHandler: requireAuth,
    bodyLimit: MCP_BODY_LIMIT,
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    reply.hijack()
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    let transport = sessionId ? sessions.get(sessionId) : undefined

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => { sessions.set(id, transport!) },
      })
      transport.onclose = () => {
        if (transport!.sessionId) sessions.delete(transport!.sessionId)
      }
      await buildMcpServer().connect(transport)
    }

    await transport.handleRequest(req.raw, reply.raw, req.body)
  })

  // GET: SSE stream for server-initiated notifications
  app.get('/mcp', { preHandler: requireAuth }, async (req, reply) => {
    reply.hijack()
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const transport = sessionId ? sessions.get(sessionId) : undefined
    if (!transport) {
      reply.raw.writeHead(400, { 'Content-Type': 'application/json' })
      reply.raw.end(JSON.stringify({ error: 'Unknown or expired session' }))
      return
    }
    await transport.handleRequest(req.raw, reply.raw)
  })

  // DELETE: clean up a session
  app.delete('/mcp', { preHandler: requireAuth }, async (req, reply) => {
    reply.hijack()
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (sessionId) {
      const transport = sessions.get(sessionId)
      if (transport) {
        await transport.close()
        sessions.delete(sessionId)
      }
    }
    reply.raw.writeHead(200)
    reply.raw.end()
  })
}
