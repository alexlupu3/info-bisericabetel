import type { FastifyInstance } from 'fastify'
import { eq, asc, and } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { groups, contentItems, groupTranslations } from '../../db/schema.js'
import { logAudit } from '../../db/audit.js'

function adminOnly(req: any, reply: any, done: any) {
  const role = (req.user as any)?.role
  if (role !== 'admin' && role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminGroupsRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, adminOnly]

  app.get('/admin/groups', { preHandler: auth }, async () => {
    const rows = await db.select().from(groups).orderBy(asc(groups.orderPosition))
    return { groups: rows }
  })

  app.post<{ Body: { title: string; sites?: string[] } }>(
    '/admin/groups', { preHandler: auth }, async (req, reply) => {
      const { title, sites = [] } = req.body
      if (!title) return reply.code(400).send({ error: 'title is required' })
      const [group] = await db.insert(groups).values({ title, sites }).returning()
      return reply.code(201).send(group)
    }
  )

  app.patch<{ Params: { id: string }; Body: { title?: string; sites?: string[] } }>(
    '/admin/groups/:id', { preHandler: auth }, async (req, reply) => {
      const { id } = req.params
      const { title, sites } = req.body
      const [updated] = await db.update(groups).set({
        ...(title !== undefined && { title }),
        ...(sites !== undefined && { sites }),
        updatedAt: new Date(),
      }).where(eq(groups.id, id)).returning()
      if (!updated) return reply.code(404).send({ error: 'Not found' })
      return updated
    }
  )

  app.put<{ Body: { order: string[] } }>(
    '/admin/groups/order', { preHandler: auth }, async (req, reply) => {
      const { order } = req.body
      if (!Array.isArray(order)) return reply.code(400).send({ error: 'order must be an array' })
      await db.transaction(async tx => {
        for (let i = 0; i < order.length; i++) {
          await tx.update(groups)
            .set({ orderPosition: i, updatedAt: new Date() })
            .where(eq(groups.id, order[i]))
        }
      })
      return { ok: true }
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/admin/groups/:id', { preHandler: auth }, async (req, reply) => {
      // Soft-delete all child content items before removing the group
      await db.update(contentItems)
        .set({ state: 'deleted', groupId: null, updatedAt: new Date() })
        .where(eq(contentItems.groupId, req.params.id))
      await db.delete(groups).where(eq(groups.id, req.params.id))
      const actor = req.user as any
      await logAudit({ userId: actor.sub, userEmail: actor.email ?? '', action: 'group.delete', entityId: req.params.id })
      return reply.code(204).send()
    }
  )

  // ── Group translations ──────────────────────────────────────────────

  // Upsert group title translation
  app.put<{ Params: { id: string; locale: string }; Body: { title: string } }>(
    '/admin/groups/:id/translations/:locale', { preHandler: auth }, async (req, reply) => {
      const { id, locale } = req.params
      const { title } = req.body
      if (!title) return reply.code(400).send({ error: 'title is required' })

      const [group] = await db.select().from(groups).where(eq(groups.id, id))
      if (!group) return reply.code(404).send({ error: 'Not found' })

      const [translation] = await db.insert(groupTranslations)
        .values({ groupId: id, locale, title, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [groupTranslations.groupId, groupTranslations.locale],
          set: { title, updatedAt: new Date() },
        })
        .returning()

      const actor = req.user as any
      await logAudit({ userId: actor.sub, userEmail: actor.email ?? '', action: 'group.translation.upsert', entityType: 'translation', entityId: id, detail: { locale } })
      return translation
    }
  )

  // Delete group title translation
  app.delete<{ Params: { id: string; locale: string } }>(
    '/admin/groups/:id/translations/:locale', { preHandler: auth }, async (req, reply) => {
      const { id, locale } = req.params
      await db.delete(groupTranslations)
        .where(and(eq(groupTranslations.groupId, id), eq(groupTranslations.locale, locale)))
      const actor = req.user as any
      await logAudit({ userId: actor.sub, userEmail: actor.email ?? '', action: 'group.translation.delete', entityType: 'translation', entityId: id, detail: { locale } })
      return reply.code(204).send()
    }
  )
}
