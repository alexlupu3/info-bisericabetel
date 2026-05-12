import type { FastifyInstance } from 'fastify'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { errorLogs } from '../../db/schema.js'

function superAdminOnly(req: any, reply: any, done: any) {
  if ((req.user as any)?.role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminErrorLogsRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, superAdminOnly]

  app.get<{ Querystring: { limit?: string; offset?: string; site?: string } }>(
    '/admin/error-logs', { preHandler: auth }, async (req) => {
      const rawLimit = parseInt(req.query.limit ?? '', 10)
      const rawOffset = parseInt(req.query.offset ?? '', 10)
      const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50), 200)
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0
      const site = req.query.site

      const rows = await db
        .select()
        .from(errorLogs)
        .$dynamic()
        .where(site ? eq(errorLogs.siteSlug, site) : undefined)
        .orderBy(desc(errorLogs.occurredAt))
        .limit(limit)
        .offset(offset)

      return { errorLogs: rows, limit, offset }
    }
  )
}
