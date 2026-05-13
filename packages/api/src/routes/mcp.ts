import { randomUUID } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { contentItems, groups, sites, media } from '../db/schema.js'
import { logAudit } from '../db/audit.js'
import { scheduleContentTranslation } from '../services/ai-translation.js'

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
      thumbnail:     z.string().url().optional().describe('Image URL from the media library'),
      startDate:     z.string().optional().describe('Visibility start date, ISO format e.g. 2024-06-01'),
      endDate:       z.string().optional().describe('Visibility end date, ISO format e.g. 2024-06-30'),
      link:          z.string().url().optional().describe('Primary action URL opened when the card is tapped'),
      cta:           z.string().optional().describe('Call-to-action button label, e.g. "Read more"'),
      sites:         z.array(z.string()).optional().describe('Site slugs to show on; omit or pass [] for all sites'),
      exclusiveSite: z.string().optional().describe('Restrict card to exactly one site (mutually exclusive with sites[])'),
      groupId:       z.string().uuid().optional().describe('ID of the group to attach this card to'),
    },
    async ({ title, description, thumbnail, startDate, endDate, link, cta,
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
      if (link       !== undefined) data.link         = link
      if (cta        !== undefined) data.cta          = cta

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

      await logAudit({
        userEmail: MCP_ACTOR,
        action:    'content.create',
        entityId:  item.id,
        detail:    { type: 'card', via: 'mcp', exclusiveSite: normalizedExclusive },
      })
      scheduleContentTranslation(item.id, data)

      return ok(item)
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
      thumbnail:     z.string().url().optional().describe('New thumbnail URL'),
      startDate:     z.string().optional().describe('New start date (ISO)'),
      endDate:       z.string().optional().describe('New end date (ISO)'),
      link:          z.string().url().optional().describe('New action URL'),
      cta:           z.string().optional().describe('New CTA label'),
      sites:         z.array(z.string()).optional().describe('New site slugs array'),
      exclusiveSite: z.string().optional().describe('New exclusive site slug; pass empty string to clear'),
    },
    async ({ id, title, description, thumbnail, startDate, endDate, link, cta,
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
      if (link        !== undefined) dataFields.link        = link
      if (cta         !== undefined) dataFields.cta         = cta

      const hasDataChanges = Object.keys(dataFields).length > 0
      const mergedData = hasDataChanges
        ? { ...(existing.data as object), ...dataFields }
        : existing.data

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
          k => JSON.stringify(oldData[k]) !== JSON.stringify(dataFields[k]),
        )
        if (changedKeys.length > 0) {
          scheduleContentTranslation(id, mergedData as Record<string, unknown>, changedKeys)
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
  app.post('/mcp', { preHandler: requireAuth }, async (req, reply) => {
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
