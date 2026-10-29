// GET /llms.txt (spec 02 FR-064(b)): agent-oriented index of the hub pages, the event
// feeds and the public JSON API, generated from the `sites` and `languages` tables.
// Same caching (strong ETag, max-age=300, 304) and rate limit as the feeds.

import type { FastifyInstance } from 'fastify'
import { buildLlmsTxt } from '../services/llms-txt.js'
import { publicBaseUrl } from '../services/public-url.js'
import { loadLanguages, loadSites } from '../services/seo/page-data.js'
import { FEED_RATE_LIMIT, sendCacheable } from './feed.js'

export async function llmsTxtRoute(app: FastifyInstance) {
  app.get('/llms.txt', { config: FEED_RATE_LIMIT }, async (req, reply) => {
    const [sites, languages] = await Promise.all([loadSites(), loadLanguages()])
    const body = buildLlmsTxt({ baseUrl: publicBaseUrl(), sites, languages })
    return sendCacheable(req, reply, body, 'text/plain; charset=utf-8')
  })
}
