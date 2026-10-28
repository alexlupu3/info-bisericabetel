import type { FastifyInstance } from 'fastify'
import type { SqlQueryRequest } from '@betel/shared'
import { db } from '../../db/client.js'
import { auditLog } from '../../db/schema.js'
import { logAudit } from '../../db/audit.js'
import { runSql, SqlConsoleError, validateSql } from '../../services/sql-console.js'

function superAdminOnly(req: any, reply: any, done: any) {
  if ((req.user as any)?.role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminSqlRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, superAdminOnly]

  app.post<{ Body: Partial<SqlQueryRequest> }>(
    '/admin/sql',
    { preHandler: auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const actor = req.user as any
      const query = typeof req.body?.query === 'string' ? req.body.query : ''
      const readOnly = req.body?.readOnly !== false

      const validation = validateSql(query, readOnly)
      if (!validation.ok) {
        if (validation.error.kind === 'blocked') {
          await logAudit({
            userId: actor.sub, userEmail: actor.email,
            action: 'sql_query_blocked', entityType: 'sql',
            detail: { query, readOnly, reason: validation.error.error },
          })
        }
        return reply.code(400).send(validation.error)
      }

      // Unlike logAudit, this fails closed: a query never runs unaudited.
      // The full text is stored (validation caps it at MAX_QUERY_LENGTH).
      try {
        await db.insert(auditLog).values({
          userId: actor.sub, userEmail: actor.email ?? '',
          action: 'sql_query', entityType: 'sql', entityId: null,
          detail: { query, readOnly },
        })
      } catch (err) {
        req.log.error(err, 'sql console: audit write failed')
        return reply.code(500).send({ error: 'Could not record the query in the audit log; it was not run.' })
      }

      try {
        return await runSql(validation.plan, readOnly)
      } catch (err) {
        if (err instanceof SqlConsoleError) {
          return reply.code(err.body.kind === 'unavailable' ? 503 : 400).send(err.body)
        }
        throw err
      }
    }
  )
}
