import type { FastifyInstance } from 'fastify'
import { eq, asc, desc } from 'drizzle-orm'
import { db } from '../db/client.js'
import { languages } from '../db/schema.js'
import { logAudit } from '../db/audit.js'

function adminOnly(req: any, reply: any, done: any) {
  const role = (req.user as any)?.role
  if (role !== 'admin' && role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

function superAdminOnly(req: any, reply: any, done: any) {
  if ((req.user as any)?.role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function languagesRoutes(app: FastifyInstance) {
  // ── Public ──────────────────────────────────────────────────────────
  app.get('/languages', async () => {
    const rows = await db.select().from(languages)
      .where(eq(languages.enabled, true))
      .orderBy(desc(languages.isDefault))
    return { languages: rows }
  })

  // ── Admin ───────────────────────────────────────────────────────────
  const auth = [app.authenticate, adminOnly]
  const superAuth = [app.authenticate, superAdminOnly]

  // List all languages (including disabled)
  app.get('/admin/languages', { preHandler: auth }, async () => {
    const rows = await db.select().from(languages)
      .orderBy(desc(languages.isDefault), asc(languages.code))
    return { languages: rows }
  })

  // Create language
  app.post<{ Body: { code: string; name: string } }>(
    '/admin/languages', { preHandler: superAuth }, async (req, reply) => {
      const { code, name } = req.body
      if (!code || !name) return reply.code(400).send({ error: 'code and name are required' })

      const [created] = await db.insert(languages).values({ code, name }).returning()
      const actor = req.user as any

      await logAudit({
        userId: actor.sub,
        userEmail: actor.email,
        action: 'language.create',
        entityType: 'language',
        entityId: code,
        detail: { code, name },
      })

      return reply.code(201).send(created)
    }
  )

  // Update language
  app.patch<{ Params: { code: string }; Body: { name?: string; enabled?: boolean } }>(
    '/admin/languages/:code', { preHandler: superAuth }, async (req, reply) => {
      const { code } = req.params
      const { name, enabled } = req.body

      const [existing] = await db.select().from(languages).where(eq(languages.code, code))
      if (!existing) return reply.code(404).send({ error: 'Language not found' })

      // Prevent disabling the default language
      if (existing.isDefault && enabled === false) {
        return reply.code(400).send({ error: 'Cannot disable the default language' })
      }

      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      if (enabled !== undefined) updates.enabled = enabled

      if (Object.keys(updates).length === 0) return existing

      const [updated] = await db.update(languages).set(updates)
        .where(eq(languages.code, code)).returning()
      const actor = req.user as any

      await logAudit({
        userId: actor.sub,
        userEmail: actor.email,
        action: 'language.update',
        entityType: 'language',
        entityId: code,
        detail: updates,
      })

      return updated
    }
  )

  // Delete language
  app.delete<{ Params: { code: string } }>(
    '/admin/languages/:code', { preHandler: superAuth }, async (req, reply) => {
      const { code } = req.params

      const [existing] = await db.select().from(languages).where(eq(languages.code, code))
      if (!existing) return reply.code(404).send({ error: 'Language not found' })

      if (existing.isDefault) {
        return reply.code(400).send({ error: 'Cannot delete the default language' })
      }

      await db.delete(languages).where(eq(languages.code, code))
      const actor = req.user as any

      await logAudit({
        userId: actor.sub,
        userEmail: actor.email,
        action: 'language.delete',
        entityType: 'language',
        entityId: code,
        detail: { code, name: existing.name },
      })

      return reply.code(204).send()
    }
  )
}
