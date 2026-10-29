import path from 'path'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import { sitesRoutes } from './routes/sites.js'
import { contentRoutes } from './routes/content.js'
import { authRoutes } from './routes/auth.js'
import { adminContentRoutes } from './routes/admin/content.js'
import { adminGroupsRoutes } from './routes/admin/groups.js'
import { adminMediaRoutes } from './routes/admin/media.js'
import { adminUsersRoutes } from './routes/admin/users.js'
import { adminSitesRoutes } from './routes/admin/sites.js'
import { adminLogsRoutes } from './routes/admin/logs.js'
import { adminAnalyticsRoutes } from './routes/admin/analytics.js'
import { eventsRoutes } from './routes/events.js'
import { errorsRoutes } from './routes/errors.js'
import { setupRoutes } from './routes/setup.js'
import { languagesRoutes } from './routes/languages.js'
import { adminTranslationsRoutes } from './routes/admin/translations.js'
import { adminErrorLogsRoutes } from './routes/admin/error-logs.js'
import { adminSqlRoutes } from './routes/admin/sql.js'
import { shortLinkRedirectRoute } from './routes/short-links.js'
import { adminShortLinksRoutes } from './routes/admin/short-links.js'
import { mcpRoutes } from './routes/mcp.js'
import { pagesRoutes } from './routes/pages.js'
import { robotsRoute } from './routes/robots.js'
import { sitemapRoute } from './routes/sitemap.js'
import { feedRoutes } from './routes/feed.js'
import { llmsTxtRoute } from './routes/llms-txt.js'
import { initPublicBaseUrl } from './services/public-url.js'
import { loadTemplate } from './services/seo/template.js'
import { seoCache } from './services/seo/cache.js'
import { runMigrations } from './db/migrate.js'
// Root package.json carries the release version (bumped by `pnpm release`).
// esbuild inlines this JSON into the bundle, so it also works in the Docker image.
import rootPkg from '../../../package.json' with { type: 'json' }

// `||` (not `??`) so that empty values from a copied env file fall back to defaults.
const PORT = Number(process.env.PORT || 3100)
const HOST = process.env.HOST || '0.0.0.0'
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required')

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), '..', 'uploads')
const PUBLIC_DIR = path.join(__dirname, 'public')

async function start() {
  // Fails fast in production when PUBLIC_BASE_URL is missing or malformed (FR-066).
  initPublicBaseUrl()
  // index.html of the SPA build, split for server-side head injection (ADR-022).
  const pageTemplate = loadTemplate(path.join(PUBLIC_DIR, 'index.html'))

  await runMigrations()

  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true })
  await app.register(jwt, { secret: JWT_SECRET! })
  await app.register(multipart)
  await app.register(rateLimit, { global: false })

  // Serve uploaded media files at /uploads/ — also decorates reply.sendFile()
  await app.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: '/uploads/',
  })

  // Short link redirects — registered before SPA static so /s/:code is handled here
  await app.register(shortLinkRedirectRoute)

  // Event feeds and the agent index (spec 02, ADR-021) — before the SPA static handler and
  // the not-found fallback, outside /api.
  await app.register(feedRoutes, { version: rootPkg.version })
  await app.register(llmsTxtRoute)

  // Crawler endpoints and server-rendered public pages (spec 03, ADR-022). Fastify prefers
  // static routes (/health, /robots.txt, /mcp, SPA files) over the parametric /:siteSlug.
  await app.register(robotsRoute)
  await app.register(sitemapRoute)
  await app.register(pagesRoutes, { template: pageTemplate, publicDir: PUBLIC_DIR })

  // Serve frontend SPA static files. `index: false`: `/` is a server-rendered page, not the
  // directory index.
  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    wildcard: false,
    index: false,
    decorateReply: false, // already decorated by the uploads plugin above
    setHeaders: (res, filePath) => {
      if (filePath.includes('/assets/')) {
        // Vite hashes these filenames — safe to cache forever
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else if (
        filePath.endsWith('.html') ||
        filePath.endsWith('sw.js') ||
        filePath.endsWith('registerSW.js') ||
        filePath.includes('workbox-') ||
        filePath.endsWith('.webmanifest')
      ) {
        // Always revalidate: entry point + service worker files must stay fresh
        res.setHeader('Cache-Control', 'no-cache')
      } else {
        // Fonts, icons — stable but not hashed; cache for a day
        res.setHeader('Cache-Control', 'public, max-age=86400')
      }
    },
  })

  // Expose authenticate decorator used by route preHandlers
  app.decorate('authenticate', async function (req: any, reply: any) {
    try {
      await req.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  app.get('/health', async () => ({
    status: 'ok',
    version: rootPkg.version,
    timestamp: new Date().toISOString(),
  }))

  // All API routes are registered under the /api prefix
  await app.register(sitesRoutes, { prefix: '/api' })
  await app.register(contentRoutes, { prefix: '/api' })
  await app.register(authRoutes, { prefix: '/api' })
  await app.register(adminContentRoutes, { prefix: '/api' })
  await app.register(adminGroupsRoutes, { prefix: '/api' })
  await app.register(adminMediaRoutes, { prefix: '/api' })
  await app.register(adminUsersRoutes, { prefix: '/api' })
  await app.register(adminSitesRoutes, { prefix: '/api' })
  await app.register(adminLogsRoutes, { prefix: '/api' })
  await app.register(adminAnalyticsRoutes, { prefix: '/api' })
  await app.register(eventsRoutes, { prefix: '/api' })
  await app.register(errorsRoutes, { prefix: '/api' })
  await app.register(setupRoutes, { prefix: '/api' })
  await app.register(languagesRoutes, { prefix: '/api' })
  await app.register(adminTranslationsRoutes, { prefix: '/api' })
  await app.register(adminShortLinksRoutes, { prefix: '/api' })
  await app.register(adminErrorLogsRoutes, { prefix: '/api' })
  await app.register(adminSqlRoutes, { prefix: '/api' })
  await app.register(mcpRoutes)

  // Rendered pages and the sitemap embed content: drop them after any admin or MCP write.
  app.addHook('onResponse', async req => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && (req.url.startsWith('/api/admin') || req.url.startsWith('/mcp'))) {
      seoCache.clear()
    }
  })

  // SPA fallback: serve index.html for any unmatched non-API route
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      return reply.code(404).send({ error: 'Not Found' })
    }
    reply.header('Cache-Control', 'no-cache')
    // The admin tool must never be indexed (FR-065).
    if (req.url === '/admin' || req.url.startsWith('/admin/') || req.url.startsWith('/admin?')) {
      reply.header('X-Robots-Tag', 'noindex, nofollow')
    }
    return reply.sendFile('index.html', PUBLIC_DIR)
  })

  await app.listen({ port: PORT, host: HOST })
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})
