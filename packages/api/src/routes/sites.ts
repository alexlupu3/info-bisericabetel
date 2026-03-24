import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { sites } from '../db/schema.js'

export async function sitesRoutes(app: FastifyInstance) {
  app.get('/sites', async () => {
    const rows = await db.select().from(sites).orderBy(sites.slug)
    return { sites: rows }
  })
}
