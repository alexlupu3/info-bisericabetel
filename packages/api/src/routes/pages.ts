// Server-rendered public pages (spec 03 FR-067/FR-070, ADR-022): `/`, `/:siteSlug`
// and `/i/:itemId` get live <head> metadata, JSON-LD, an HTML snapshot of the feed
// and inline initial data injected into the SPA's index.html.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { etagMatches, seoCache } from '../services/seo/cache.js'
import { loadPageModel, type PageRequest } from '../services/seo/page-data.js'
import { renderPage } from '../services/seo/render-page.js'
import type { PageTemplate } from '../services/seo/template.js'

export interface PagesRoutesOptions {
  /** Parsed index.html; null when the app is not built (pages then fall back to the plain file). */
  template: PageTemplate | null
  publicDir: string
}

// First path segments that are never site slugs: they belong to server routes or the
// admin SPA and fall through to the not-found handler (JSON 404 for /api, shell for /admin).
const RESERVED_SEGMENTS = new Set(['api', 'admin', 'mcp', 's', 'i', 'uploads', 'assets', 'icons', 'fonts'])

export async function pagesRoutes(app: FastifyInstance, opts: PagesRoutesOptions) {
  const { template, publicDir } = opts

  async function serve(req: FastifyRequest, reply: FastifyReply, page: PageRequest) {
    reply.header('Cache-Control', 'no-cache')
    if (!template) return reply.sendFile('index.html', publicDir)

    const cached = await seoCache.get(`page:${page.path}`, async () => {
      const model = await loadPageModel(page)
      return { status: model.status, body: renderPage(model, template), contentType: 'text/html; charset=utf-8' }
    })

    reply.header('Vary', 'Accept-Encoding').type(cached.contentType)
    if (cached.status === 200) {
      reply.header('ETag', cached.etag)
      if (etagMatches(req.headers['if-none-match'], cached.etag)) return reply.code(304).send()
    }
    return reply.code(cached.status).send(cached.body)
  }

  app.get('/', (req, reply) => serve(req, reply, { kind: 'hub', path: '/' }))

  app.get<{ Params: { siteSlug: string } }>('/:siteSlug', (req, reply) => {
    const { siteSlug } = req.params
    if (RESERVED_SEGMENTS.has(siteSlug)) return reply.callNotFound()
    return serve(req, reply, { kind: 'site', path: `/${siteSlug}`, siteSlug })
  })

  app.get<{ Params: { itemId: string } }>('/i/:itemId', (req, reply) => {
    const { itemId } = req.params
    return serve(req, reply, { kind: 'item', path: `/i/${itemId}`, itemId })
  })
}
