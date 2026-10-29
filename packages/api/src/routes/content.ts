import type { FastifyInstance } from 'fastify'
import { DEFAULT_LOCALE, findPublicItem, listPublicContent } from '../services/public-content.js'

export async function contentRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { site?: string; locale?: string } }>('/content', async req => {
    const { site, locale } = req.query
    const items = await listPublicContent({ site: site || null, locale: locale || DEFAULT_LOCALE })
    return {
      site: site ?? null,
      items,
    }
  })

  // One item visible on the public hub (published, not expired) — used by the item page /i/:itemId.
  app.get<{ Params: { id: string }; Querystring: { locale?: string } }>('/content/:id', async (req, reply) => {
    const result = await findPublicItem(req.params.id, req.query.locale || DEFAULT_LOCALE)
    if (result.status === 'visible') return { item: result.item }
    return reply.code(result.status === 'gone' ? 410 : 404).send({ error: 'Not Found' })
  })
}
