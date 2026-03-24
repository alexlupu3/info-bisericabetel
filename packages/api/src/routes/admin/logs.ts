import type { FastifyInstance } from 'fastify'
import { desc } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { auditLog } from '../../db/schema.js'

function superAdminOnly(req: any, reply: any, done: any) {
  if ((req.user as any)?.role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminLogsRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, superAdminOnly]

  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/admin/logs', { preHandler: auth }, async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 100), 200)
      const offset = Number(req.query.offset ?? 0)

      const rows = await db
        .select()
        .from(auditLog)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset)

      return { logs: rows, limit, offset }
    }
  )
}
