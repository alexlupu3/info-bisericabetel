import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { errorLogs } from '../db/schema.js'

export async function errorsRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      message: string
      stack?: string
      url?: string
      site?: string | null
      device?: Record<string, unknown>
    }
  }>('/errors', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { message, stack, url, site, device } = req.body ?? {}

    if (!message || typeof message !== 'string') {
      return reply.code(400).send({ error: 'message is required' })
    }

    reply.code(204).send()

    db.insert(errorLogs).values({
      message:  message.slice(0, 2000),
      stack:    stack?.slice(0, 10000) ?? null,
      url:      url ?? null,
      siteSlug: site ?? null,
      device:   device ?? {},
    }).catch(() => {})
  })
}
