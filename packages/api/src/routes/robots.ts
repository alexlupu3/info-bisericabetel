// GET /robots.txt (spec 03 FR-065): allow everything public, keep admin, API,
// short links and MCP out of the index, point to the sitemap. Served from a route
// (not a static file) so it can carry PUBLIC_BASE_URL.

import type { FastifyInstance } from 'fastify'
import { absoluteUrl } from '../services/public-url.js'

export function robotsTxt(): string {
  return [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /s/',
    'Disallow: /mcp',
    '# Event feeds: /feed.xml, /<siteSlug>/feed.xml (see /llms.txt)',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n')
}

export async function robotsRoute(app: FastifyInstance) {
  app.get('/robots.txt', async (_req, reply) => {
    return reply
      .type('text/plain; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(robotsTxt())
  })
}
