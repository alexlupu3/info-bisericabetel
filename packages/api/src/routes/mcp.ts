import { randomUUID } from 'crypto'
import { promises as fsp } from 'fs'
import { join } from 'path'
import type { FastifyInstance } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { db } from '../db/client.js'
import { contentItems, groups, sites, media } from '../db/schema.js'
import { logAudit } from '../db/audit.js'
import { scheduleContentTranslation } from '../services/ai-translation.js'
import { resortGroupChronologically } from '../services/group-order.js'
import { isCalendarDay } from '../services/time.js'
import { invalidStartTime, isClockTime } from '@betel/shared'

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), '..', 'uploads')
const MAX_WIDTH = 1980
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
// upload_media sends the image base64-encoded inside a JSON-RPC body: 5 MB of image data
// is ~6.7 MB of base64 (4/3 overhead), plus the envelope. A reverse proxy in front
// (e.g. CapRover's nginx) must allow at least this much.
const MCP_BODY_LIMIT = 8 * 1024 * 1024

// Media library URLs are relative (/uploads/<uuid>.webp); external absolute URLs are also accepted.
const thumbnailSchema = z.string().refine(
  v => v.startsWith('/uploads/') || URL.canParse(v),
  'must be a media library path (/uploads/...) or an absolute URL',
)

// Event dates are calendar days in Romania; a malformed value would otherwise
// be stored as-is and break date filtering.
const calendarDaySchema = z.string().refine(isCalendarDay, 'must be a calendar date in YYYY-MM-DD format')

// Event start time (BR-035). Built on the shared helper, never on a copied regex.
// Spec 05 moves this into the shared tool contract (packages/shared/src/mcp-tools.ts).
const clockTimeSchema = z.string().refine(isClockTime, 'must be a 24-hour clock time in HH:mm format')

const MCP_ACTOR = 'mcp@betel'

const sessions = new Map<string, StreamableHTTPServerTransport>()

function err(msg: string) {
  return { isError: true as const, content: [{ type: 'text' as const, text: msg }] }
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'betel-mcp', version: '1.0.0' })

  // ── list_sites ──────────────────────────────────────────────

  server.tool(
    'list_sites',
    'List all church sites (slugs, names, accent colours). Use slugs when scoping cards to specific sites.',
    {},
    async () => ok(await db.select().from(sites)),
  )

  // ── list_groups ─────────────────────────────────────────────

  server.tool(
    'list_groups',
    'List all content groups. Use group IDs when attaching a card to a group.',
    {},
    async () => ok(
      await db.select().from(groups)
        .where(ne(groups.state, 'deleted'))
        .orderBy(asc(groups.orderPosition)),
    ),
  )

  // ── list_media ──────────────────────────────────────────────

  server.tool(
    'list_media',
    'List images in the media library. Use the returned URLs as thumbnail values when creating cards.',
    {},
    async () => ok(await db.select().from(media)),
  )

  // ── upload_media ────────────────────────────────────────────

  server.tool(
    'upload_media',
    'Upload an image (max 5 MB decoded) to the media library from base64-encoded data. Returns the uploaded image ID and its relative URL (e.g. /uploads/<id>.webp). Pass that URL as-is as the thumbnail when creating or updating cards.',
    {
      imageData: z.string().describe('Base64-encoded image data (raw bytes, without a data: URI prefix)'),
      filename: z.string().optional().describe('Original filename e.g. "photo.jpg" — used for reference only'),
    },
    async ({ imageData, filename }) => {
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
  )

  // ── list_cards ──────────────────────────────────────────────

  server.tool(
    'list_cards',
    'List all card content items (including drafts and archived). Returns id, state, data, and site scoping.',
    {},
    async () => ok(
      await db.select().from(contentItems)
        .where(and(eq(contentItems.type, 'card'), ne(contentItems.state, 'deleted')))
        .orderBy(asc(contentItems.orderPosition)),
    ),
  )

  // ── create_card ─────────────────────────────────────────────

  server.tool(
    'create_card',
    'Create a new card content item (starts as draft). Returns the created item with its ID.',
    {
      title:         z.string().describe('Card title (required)'),
      description:   z.string().optional().describe('Card body text — supports Markdown'),
      thumbnail:     thumbnailSchema.optional().describe('Image URL from the media library (as returned by upload_media / list_media, e.g. /uploads/<id>.webp)'),
      startDate:     calendarDaySchema.optional().describe('Visibility start date, YYYY-MM-DD (Romania calendar day), e.g. 2024-06-01'),
      endDate:       calendarDaySchema.optional().describe('Visibility end date, YYYY-MM-DD; the card stays visible until the end of this day in Romania'),
      startTime:     clockTimeSchema.optional().describe('Start time HH:mm (24-hour, Romania local time). Only for single-day events: requires startDate and no endDate (or endDate equal to startDate).'),
      link:          z.string().url().optional().describe('Primary action URL opened when the card is tapped'),
      cta:           z.string().optional().describe('Call-to-action button label, e.g. "Read more"'),
      sites:         z.array(z.string()).optional().describe('Site slugs to show on; omit or pass [] for all sites'),
      exclusiveSite: z.string().optional().describe('Restrict card to exactly one site (mutually exclusive with sites[])'),
      groupId:       z.string().uuid().optional().describe('ID of the group to attach this card to'),
    },
    async ({ title, description, thumbnail, startDate, endDate, startTime, link, cta,
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
      const timeError = invalidStartTime(data)
      if (timeError) return err(timeError)

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
  )

  // ── update_card ─────────────────────────────────────────────

  server.tool(
    'update_card',
    'Update fields on an existing card. Only the provided fields are changed.',
    {
      id:            z.string().uuid().describe('Card ID to update'),
      title:         z.string().optional().describe('New title'),
      description:   z.string().optional().describe('New description (Markdown)'),
      thumbnail:     thumbnailSchema.optional().describe('New thumbnail URL (media library path /uploads/... or absolute URL)'),
      startDate:     calendarDaySchema.optional().describe('New start date, YYYY-MM-DD'),
      endDate:       calendarDaySchema.optional().describe('New end date, YYYY-MM-DD'),
      startTime:     clockTimeSchema.nullable().optional().describe('New start time HH:mm (Romania local time), or null to clear. Only for single-day events.'),
      link:          z.string().url().optional().describe('New action URL'),
      cta:           z.string().optional().describe('New CTA label'),
      sites:         z.array(z.string()).optional().describe('New site slugs array'),
      exclusiveSite: z.string().optional().describe('New exclusive site slug; pass empty string to clear'),
    },
    async ({ id, title, description, thumbnail, startDate, endDate, startTime, link, cta,
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
      // Validate the resulting data: a time may not survive on a multi-day or undated card.
      const timeError = invalidStartTime(mergedData)
      if (hasDataChanges && timeError) return err(timeError)

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
  )

  // ── publish_card ────────────────────────────────────────────

  server.tool(
    'publish_card',
    'Publish a card (transition from draft → published so it appears on the public site).',
    {
      id: z.string().uuid().describe('Card ID to publish'),
    },
    async ({ id }) => {
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
  )

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

  function requireAuth(req: any, reply: any, done: any) {
    if (req.headers.authorization !== `Bearer ${MCP_SECRET}`) {
      reply.code(401).send({ error: 'Unauthorized' })
      return
    }
    done()
  }

  // POST: initialise a new session or resume an existing one
  app.post('/mcp', { preHandler: requireAuth, bodyLimit: MCP_BODY_LIMIT }, async (req, reply) => {
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
