// GET /sitemap.xml (spec 03 FR-071): the hub, every site page and every item page
// visible in the all-sites view or any site view, with <lastmod>.

import type { FastifyInstance } from 'fastify'
import { DEFAULT_LOCALE, listPublicContent } from '../services/public-content.js'
import { etagMatches, seoCache } from '../services/seo/cache.js'
import { loadSites } from '../services/seo/page-data.js'
import { sitemapEntries, sitemapXml } from '../services/seo/sitemap.js'

export async function sitemapRoute(app: FastifyInstance) {
  app.get('/sitemap.xml', async (req, reply) => {
    const cached = await seoCache.get('sitemap', async () => {
      const sites = await loadSites()
      const [allItems, ...perSite] = await Promise.all([
        listPublicContent({ site: null, locale: DEFAULT_LOCALE }),
        ...sites.map(s => listPublicContent({ site: s.slug, locale: DEFAULT_LOCALE })),
      ])
      const siteLists = sites.map((s, i) => ({ slug: s.slug, items: perSite[i] }))
      return { status: 200, body: sitemapXml(sitemapEntries(allItems, siteLists)), contentType: 'application/xml; charset=utf-8' }
    })
    reply.type(cached.contentType).header('Cache-Control', 'public, max-age=600').header('ETag', cached.etag)
    if (etagMatches(req.headers['if-none-match'], cached.etag)) return reply.code(304).send()
    return reply.send(cached.body)
  })
}
