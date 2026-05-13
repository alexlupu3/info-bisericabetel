import type { FastifyInstance } from 'fastify'
import { eq, ne, asc, and, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { contentItems, groups, contentTranslations, languages, sites as sitesTable, analyticsEvents, auditLog } from '../../db/schema.js'
import { logAudit } from '../../db/audit.js'
import { scheduleContentTranslation } from '../../services/ai-translation.js'

function sortGroupByStartDate<T extends { id: string; data: Record<string, unknown> }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = (a.data.startDate as string | undefined) ?? null
    const db = (b.data.startDate as string | undefined) ?? null
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return da < db ? -1 : da > db ? 1 : 0
  })
}

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

    // Assign order_position = max + 1 as a safe initial value
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

    // When inserted into a group, reorder the whole group chronologically by startDate.
    // This ensures programmatic creation (MCP, integrations) places items correctly without
    // requiring a separate reorder call from the caller.
    let finalOrderPosition = item.orderPosition
    if (groupId) {
      const groupItems = await db.select()
        .from(contentItems)
        .where(and(eq(contentItems.groupId, groupId), ne(contentItems.state, 'deleted')))

      const sorted = sortGroupByStartDate(groupItems)
      await db.transaction(async tx => {
        for (let i = 0; i < sorted.length; i++) {
          await tx.update(contentItems)
            .set({ orderPosition: i })
            .where(eq(contentItems.id, sorted[i].id))
        }
      })
      const idx = sorted.findIndex(s => s.id === item.id)
      if (idx === -1) {
        // Insertion succeeded but item not found in sibling query — return with the
        // temporary position rather than propagating -1.
        finalOrderPosition = item.orderPosition
      } else {
        finalOrderPosition = idx
      }
    }

    const actor = req.user as any
    await logAudit({
      userId: actor.sub,
      userEmail: actor.email ?? '',
      action: 'content.create',
      entityId: item.id,
      detail: { type, exclusiveSite: normalizedExclusive },
    })
    if (Object.keys(data).length > 0) scheduleContentTranslation(item.id, data)
    return reply.code(201).send({ ...item, orderPosition: finalOrderPosition })
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
      if (data !== undefined && Object.keys(data).length > 0) {
        const oldData = (existing.data ?? {}) as Record<string, unknown>
        const changedKeys = Object.keys(data).filter(
          k => JSON.stringify(oldData[k]) !== JSON.stringify(data[k])
        )
        if (changedKeys.length > 0) scheduleContentTranslation(id, updated.data as Record<string, unknown>, changedKeys)
      }
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

  // Duplicate
  app.post<{ Params: { id: string } }>('/admin/content/:id/duplicate', { preHandler: auth }, async (req, reply) => {
    const [original] = await db.select().from(contentItems).where(eq(contentItems.id, req.params.id))
    if (!original) return reply.code(404).send({ error: 'Not found' })

    const mediaFields: Record<string, string[]> = {
      card:     ['thumbnail'],
      poster:   ['imageUrl'],
    }
    const fieldsToStrip = mediaFields[original.type] ?? []
    const clonedData = { ...(original.data as Record<string, unknown>) }
    for (const f of fieldsToStrip) delete clonedData[f]

    const [{ max }] = await db.select({ max: sql<number>`COALESCE(MAX(order_position), -1)` })
      .from(contentItems)

    const [item] = await db.insert(contentItems).values({
      type: original.type,
      sites: original.sites,
      exclusiveSite: original.exclusiveSite,
      groupId: original.groupId,
      expiresAt: original.expiresAt,
      data: clonedData,
      orderPosition: max + 1,
      state: 'draft',
    }).returning()

    const actor = req.user as any
    await logAudit({
      userId: actor.sub,
      userEmail: actor.email ?? '',
      action: 'content.duplicate',
      entityId: item.id,
      detail: { sourceId: original.id, type: original.type },
    })
    if (Object.keys(clonedData).length > 0) scheduleContentTranslation(item.id, clonedData)
    return reply.code(201).send(item)
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
    await db.delete(analyticsEvents).where(eq(analyticsEvents.itemId, req.params.id))
    await db.delete(auditLog).where(eq(auditLog.entityId, req.params.id))
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

  // ── Content translations ──────────────────────────────────────────────

  // List translations for a content item
  app.get<{ Params: { id: string } }>(
    '/admin/content/:id/translations', { preHandler: auth }, async (req, reply) => {
      const [item] = await db.select().from(contentItems).where(eq(contentItems.id, req.params.id))
      if (!item) return reply.code(404).send({ error: 'Not found' })
      const translations = await db.select().from(contentTranslations)
        .where(eq(contentTranslations.contentItemId, req.params.id))
      return { translations }
    }
  )

  // Upsert content translation
  app.put<{ Params: { id: string; locale: string }; Body: { data: Record<string, unknown> } }>(
    '/admin/content/:id/translations/:locale', { preHandler: auth }, async (req, reply) => {
      const { id, locale } = req.params
      const { data } = req.body
      if (!data) return reply.code(400).send({ error: 'data is required' })

      const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id))
      if (!item) return reply.code(404).send({ error: 'Not found' })

      const [lang] = await db.select().from(languages).where(eq(languages.code, locale))
      if (!lang) return reply.code(400).send({ error: `Locale '${locale}' does not exist` })

      const [translation] = await db.insert(contentTranslations)
        .values({ contentItemId: id, locale, data, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [contentTranslations.contentItemId, contentTranslations.locale],
          set: { data, updatedAt: new Date() },
        })
        .returning()

      const actor = req.user as any
      await logAudit({ userId: actor.sub, userEmail: actor.email ?? '', action: 'content.translation.upsert', entityType: 'translation', entityId: id, detail: { locale } })
      return translation
    }
  )

  // Delete content translation
  app.delete<{ Params: { id: string; locale: string } }>(
    '/admin/content/:id/translations/:locale', { preHandler: auth }, async (req, reply) => {
      const { id, locale } = req.params
      await db.delete(contentTranslations)
        .where(and(eq(contentTranslations.contentItemId, id), eq(contentTranslations.locale, locale)))
      const actor = req.user as any
      await logAudit({ userId: actor.sub, userEmail: actor.email ?? '', action: 'content.translation.delete', entityType: 'translation', entityId: id, detail: { locale } })
      return reply.code(204).send()
    }
  )
}
