import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
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
import { setupRoutes } from './routes/setup.js'
import { runMigrations } from './db/migrate.js'

const PORT = Number(process.env.PORT ?? 3100)
const HOST = process.env.HOST ?? '127.0.0.1'
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required')

async function start() {
  await runMigrations()

  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true })
  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(multipart)

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

  await app.register(sitesRoutes)
  await app.register(contentRoutes)
  await app.register(authRoutes)
  await app.register(adminContentRoutes)
  await app.register(adminGroupsRoutes)
  await app.register(adminMediaRoutes)
  await app.register(adminUsersRoutes)
  await app.register(adminSitesRoutes)
  await app.register(adminLogsRoutes)
  await app.register(adminAnalyticsRoutes)
  await app.register(eventsRoutes)
  await app.register(setupRoutes)

  await app.listen({ port: PORT, host: HOST })
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})
