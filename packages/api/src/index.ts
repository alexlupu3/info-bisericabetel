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
import { shortLinkRedirectRoute, adminShortLinksRoutes } from './routes/short-links.js'
import { runMigrations } from './db/migrate.js'

const PORT = Number(process.env.PORT ?? 3100)
const HOST = process.env.HOST ?? '0.0.0.0'
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required')

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), '..', 'uploads')
const PUBLIC_DIR = path.join(__dirname, 'public')

async function start() {
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

  // Serve frontend SPA static files
  await app.register(fastifyStatic, {
    root: PUBLIC_DIR,
    wildcard: false,
    decorateReply: false, // already decorated by the uploads plugin above
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
    version: '1.0.0',
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

  // SPA fallback: serve index.html for any unmatched non-API route
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      return reply.code(404).send({ error: 'Not Found' })
    }
    return reply.sendFile('index.html', PUBLIC_DIR)
  })

  await app.listen({ port: PORT, host: HOST })
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})
