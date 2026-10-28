import type { FastifyInstance } from 'fastify'
import type { SqlQueryRequest } from '@betel/shared'
import { db } from '../../db/client.js'
import { auditLog } from '../../db/schema.js'
import { logAudit } from '../../db/audit.js'
import { runSql, SqlConsoleError, validateSql } from '../../services/sql-console.js'

const AUDIT_QUERY_CHARS = 2000

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
      const auditedQuery = query.slice(0, AUDIT_QUERY_CHARS)

      const validation = validateSql(query, readOnly)
      if (!validation.ok) {
        if (validation.error.kind === 'blocked') {
          await logAudit({
            userId: actor.sub, userEmail: actor.email,
            action: 'sql_query_blocked', entityType: 'sql',
            detail: { query: auditedQuery, readOnly, reason: validation.error.error },
          })
        }
        return reply.code(400).send(validation.error)
      }

      // Unlike logAudit, this fails closed: a query never runs unaudited
      try {
        await db.insert(auditLog).values({
          userId: actor.sub, userEmail: actor.email ?? '',
          action: 'sql_query', entityType: 'sql', entityId: null,
          detail: { query: auditedQuery, readOnly, truncated: query.length > AUDIT_QUERY_CHARS },
        })
      } catch (err) {
        req.log.error(err, 'sql console: audit write failed')
        return reply.code(500).send({ error: 'Could not record the query in the audit log; it was not run.' })
      }

      try {
        return await runSql(query, readOnly)
      } catch (err) {
        if (err instanceof SqlConsoleError) return reply.code(400).send(err.body)
        throw err
      }
    }
  )
}
