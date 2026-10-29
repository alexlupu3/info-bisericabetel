import type { FastifyInstance } from 'fastify'
import { ensureOgImage, ogDir } from '../services/og-image.js'
import { OG_NAME_PATTERN } from '../services/preview-image.js'

// Crawler-safe share images (spec 06 FR-087): `/uploads/og/<media-uuid>.jpg` and
// `/uploads/og/brand-<hex>.jpg`, generated on first request. Registered next to the
// `/uploads/` static plugin; Fastify prefers this parametric route over its wildcard.
export async function ogImageRoute(app: FastifyInstance) {
  app.get<{ Params: { name: string } }>('/uploads/og/:name', async (req, reply) => {
    const { name } = req.params
    if (!OG_NAME_PATTERN.test(name)) return reply.code(404).send({ error: 'Not Found' })

    const image = await ensureOgImage(name)
    if (!image) return reply.code(404).send({ error: 'Not Found' })

    // Names are immutable: a new upload gets a new UUID, a new accent a new brand file.
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    reply.type('image/jpeg')
    return reply.sendFile(name, ogDir(), { cacheControl: false })
  })
}
