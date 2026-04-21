import type { FastifyInstance } from 'fastify'
import { eq, ne, asc, and, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { contentItems, groups, sites as sitesTable } from '../../db/schema.js'
import { logAudit } from '../../db/audit.js'

type ItemBody = {
  type: string
  sites?: string[]
  exclusiveSite?: string | null
  groupId?: string | null
  expiresAt?: string | null
  data?: Record<string, unknown>
}

// Validate that a non-empty exclusiveSite refers to a real site slug.
async function siteSlugExists(slug: string): Promise<boolean> {
  const [row] = await db.select({ slug: sitesTable.slug })
    .from(sitesTable)
    .where(eq(sitesTable.slug, slug))
  return !!row
}

type OrderBody = { order: string[] }

function adminOnly(req: any, reply: any, done: any) {
  const role = (req.user as any)?.role
  if (role !== 'admin' && role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminContentRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, adminOnly]

  // List all items (excluding soft-deleted) for the admin
  app.get('/admin/content', { preHandler: auth }, async () => {
    const items = await db.select().from(contentItems)
      .where(ne(contentItems.state, 'deleted'))
      .orderBy(asc(contentItems.orderPosition))
    return { items }
  })

  // List soft-deleted items for the archive page
  app.get('/admin/content/deleted', { preHandler: auth }, async () => {
    const items = await db.select().from(contentItems)
      .where(eq(contentItems.state, 'deleted'))
      .orderBy(asc(contentItems.updatedAt))
    return { items }
  })

  // Create
  app.post<{ Body: ItemBody }>('/admin/content', { preHandler: auth }, async (req, reply) => {
    const { type, sites = [], exclusiveSite = null, groupId = null, expiresAt = null, data = {} } = req.body
    if (!type) return reply.code(400).send({ error: 'type is required' })

    // Normalise exclusiveSite: empty string → null. When set, validate the slug
    // and force sites=[] so the two scoping concepts never coexist on one row.
    const normalizedExclusive = exclusiveSite && exclusiveSite.length > 0 ? exclusiveSite : null
    if (normalizedExclusive) {
      if (!(await siteSlugExists(normalizedExclusive))) {
        return reply.code(400).send({ error: 'invalid exclusiveSite' })
      }
    }
    const finalSites = normalizedExclusive ? [] : sites

    // Assign order_position = max + 1
    const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(order_position), -1)` })
      .from(contentItems)

    const [item] = await db.insert(contentItems).values({
      type,
      sites: finalSites,
      exclusiveSite: normalizedExclusive,
      groupId: groupId ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      data,
      orderPosition: max + 1,
      state: 'draft',
    }).returning()

    const actor = req.user as any
    await logAudit({
      userId: actor.sub,
      userEmail: actor.email ?? '',
      action: 'content.create',
      entityId: item.id,
      detail: { type, exclusiveSite: normalizedExclusive },
    })
    return reply.code(201).send(item)
  })

  // Get single
  app.get<{ Params: { id: string } }>('/admin/content/:id', { preHandler: auth }, async (req, reply) => {
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, req.params.id))
    if (!item) return reply.code(404).send({ error: 'Not found' })
    return item
  })

  // Update
  app.patch<{ Params: { id: string }; Body: Partial<ItemBody> & { state?: string } }>(
    '/admin/content/:id', { preHandler: auth }, async (req, reply) => {
      const { id } = req.params
      const [existing] = await db.select().from(contentItems).where(eq(contentItems.id, id))
      if (!existing) return reply.code(404).send({ error: 'Not found' })

      const { type, sites, exclusiveSite, groupId, expiresAt, data, state } = req.body

      // Normalise exclusiveSite from the request and decide what the resulting state will be.
      // Treat empty string as null; only validate when it's actually changing to a non-null value.
      const exclusiveProvided = exclusiveSite !== undefined
      const normalizedExclusive = exclusiveProvided
        ? (exclusiveSite && exclusiveSite.length > 0 ? exclusiveSite : null)
        : existing.exclusiveSite
      if (exclusiveProvided && normalizedExclusive) {
        if (!(await siteSlugExists(normalizedExclusive))) {
          return reply.code(400).send({ error: 'invalid exclusiveSite' })
        }
      }

      // Clearing exclusivity changes visibility scope: an exclusive row has sites=[], which
      // would otherwise mean "all sites" once exclusiveSite is null. Require the caller to
      // state the new sites scope explicitly so we never silently widen visibility.
      const clearingExclusive = exclusiveProvided
        && normalizedExclusive === null
        && existing.exclusiveSite !== null
      if (clearingExclusive && sites === undefined) {
        return reply.code(400).send({ error: 'sites is required when clearing exclusiveSite' })
      }

      // If the resulting row will be exclusive, sites[] must be empty regardless of what
      // the request asked for. Otherwise, honour an explicit sites field if present.
      const sitesPatch: { sites: string[] } | undefined = normalizedExclusive !== null
        ? { sites: [] }
        : (sites !== undefined ? { sites } : undefined)

      const [updated] = await db.update(contentItems).set({
        ...(type    !== undefined && { type }),
        ...(sitesPatch ?? {}),
        ...(exclusiveProvided && { exclusiveSite: normalizedExclusive }),
        ...(groupId !== undefined && { groupId }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(data    !== undefined && { data }),
        ...(state   !== undefined && { state }),
        updatedAt: new Date(),
      }).where(eq(contentItems.id, id)).returning()

      const actor = req.user as any
      await logAudit({
        userId: actor.sub,
        userEmail: actor.email ?? '',
        action: 'content.update',
        entityId: id,
        detail: exclusiveProvided ? { exclusiveSite: normalizedExclusive } : {},
      })
      return updated
    }
  )

  // Soft-delete (move to archive)
  app.delete<{ Params: { id: string } }>('/admin/content/:id', { preHandler: auth }, async (req, reply) => {
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, req.params.id))
    if (!item) return reply.code(404).send({ error: 'Not found' })
    await db.update(contentItems)
      .set({ state: 'deleted', updatedAt: new Date() })
      .where(eq(contentItems.id, req.params.id))
    const actor = req.user as any
    await logAudit({ userId: actor.sub, userEmail: actor.email ?? '', action: 'content.delete', entityId: req.params.id })
    return reply.code(204).send()
  })

  // Restore from archive
  app.post<{ Params: { id: string } }>('/admin/content/:id/restore', { preHandler: auth }, async (req, reply) => {
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, req.params.id))
    if (!item) return reply.code(404).send({ error: 'Not found' })
    const [updated] = await db.update(contentItems)
      .set({ state: 'draft', groupId: null, updatedAt: new Date() })
      .where(eq(contentItems.id, req.params.id))
      .returning()
    const actor = req.user as any
    await logAudit({ userId: actor.sub, userEmail: actor.email ?? '', action: 'content.restore', entityId: req.params.id })
    return updated
  })

  // Permanent delete (from archive)
  app.delete<{ Params: { id: string } }>('/admin/content/:id/permanent', { preHandler: auth }, async (req, reply) => {
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, req.params.id))
    if (!item) return reply.code(404).send({ error: 'Not found' })
    await db.delete(contentItems).where(eq(contentItems.id, req.params.id))
    const actor = req.user as any
    await logAudit({ userId: actor.sub, userEmail: actor.email ?? '', action: 'content.permanent-delete', entityId: req.params.id })
    return reply.code(204).send()
  })

  // Reorder within-group — accepts ordered array of item IDs; returns all items
  app.put<{ Body: OrderBody }>('/admin/content/order', { preHandler: auth }, async (req, reply) => {
    const { order } = req.body
    if (!Array.isArray(order)) return reply.code(400).send({ error: 'order must be an array' })

    await db.transaction(async tx => {
      for (let i = 0; i < order.length; i++) {
        await tx.update(contentItems)
          .set({ orderPosition: i, updatedAt: new Date() })
          .where(eq(contentItems.id, order[i]))
      }
    })

    const items = await db.select().from(contentItems)
      .where(ne(contentItems.state, 'deleted'))
      .orderBy(asc(contentItems.orderPosition))
    return { items }
  })

  // Reorder root-level — accepts ordered array of { id, kind } entries (items and groups interleaved);
  // returns all items and groups so the client can update its cache without a second GET request.
  app.put<{ Body: { order: Array<{ id: string; kind: string }> } }>(
    '/admin/content/root-order', { preHandler: auth }, async (req, reply) => {
      const { order } = req.body
      if (!Array.isArray(order)) return reply.code(400).send({ error: 'order must be an array' })

      await db.transaction(async tx => {
        for (let i = 0; i < order.length; i++) {
          const { id, kind } = order[i]
          if (kind === 'group') {
            await tx.update(groups)
              .set({ orderPosition: i, updatedAt: new Date() })
              .where(eq(groups.id, id))
          } else {
            await tx.update(contentItems)
              .set({ orderPosition: i, updatedAt: new Date() })
              .where(eq(contentItems.id, id))
          }
        }
      })

      const [items, allGroups] = await Promise.all([
        db.select().from(contentItems)
          .where(ne(contentItems.state, 'deleted'))
          .orderBy(asc(contentItems.orderPosition)),
        db.select().from(groups).orderBy(asc(groups.orderPosition)),
      ])
      return { items, groups: allGroups }
    }
  )

  // Publish / archive shortcuts
  app.post<{ Params: { id: string } }>('/admin/content/:id/publish', { preHandler: auth }, async (req, reply) => {
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, req.params.id))
    if (!item) return reply.code(404).send({ error: 'Not found' })
    const [updated] = await db.update(contentItems)
      .set({ state: 'published', updatedAt: new Date() })
      .where(eq(contentItems.id, req.params.id))
      .returning()
    const actor = req.user as any
    await logAudit({ userId: actor.sub, userEmail: actor.email ?? '', action: 'content.publish', entityId: req.params.id })
    return updated
  })

  app.post<{ Params: { id: string } }>('/admin/content/:id/archive', { preHandler: auth }, async (req, reply) => {
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, req.params.id))
    if (!item) return reply.code(404).send({ error: 'Not found' })
    const [updated] = await db.update(contentItems)
      .set({ state: 'archived', updatedAt: new Date() })
      .where(eq(contentItems.id, req.params.id))
      .returning()
    const actor = req.user as any
    await logAudit({ userId: actor.sub, userEmail: actor.email ?? '', action: 'content.archive', entityId: req.params.id })
    return updated
  })
}
