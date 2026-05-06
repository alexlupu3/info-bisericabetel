import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { analyticsEvents } from '../db/schema.js'

export async function eventsRoutes(app: FastifyInstance) {
  app.post<{
    Body: { type: string; site?: string | null; itemId?: string; url?: string }
  }>('/events', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { type, site, itemId, url } = req.body ?? {}

    if (type !== 'site_visit' && type !== 'link_click') {
      return reply.code(400).send({ error: 'Invalid event type' })
    }

    // Fire-and-forget — respond immediately, insert asynchronously
    reply.code(204).send()

    db.insert(analyticsEvents).values({
      eventType: type,
      siteSlug:  site ?? null,
      itemId:    itemId ?? null,
      url:       url ?? null,
    }).catch(() => {})
  })
}
