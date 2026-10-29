import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { sites } from '../../db/schema.js'
import { siteUpdates, type SiteBody } from '../../services/site-updates.js'

function superAdminOnly(req: any, reply: any, done: any) {
  if ((req.user as any)?.role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminSitesRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, superAdminOnly]

  app.patch<{ Params: { slug: string }; Body: SiteBody }>(
    '/admin/sites/:slug', { preHandler: auth }, async (req, reply) => {
      const { slug } = req.params

      const [existing] = await db.select().from(sites).where(eq(sites.slug, slug))
      if (!existing) return reply.code(404).send({ error: 'Site not found' })

      const result = siteUpdates(req.body ?? {}, existing)
      if ('error' in result) return reply.code(400).send({ error: result.error })
      const { updates } = result

      if (Object.keys(updates).length === 0) return existing

      const [updated] = await db.update(sites).set(updates).where(eq(sites.slug, slug)).returning()
      return updated
    }
  )
}
