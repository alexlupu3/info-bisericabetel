import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'
import { sites } from '../db/schema.js'
import { ensureOgImage, ogDir } from '../services/og-image.js'
import { accentHex, NEUTRAL_ACCENT, OG_NAME_PATTERN } from '../services/preview-image.js'

/**
 * Brand images exist only for colours in use (the site accents and the neutral hub colour),
 * so public requests cannot make the server render and store a file per arbitrary hex.
 */
async function isBrandInUse(name: string): Promise<boolean> {
  const hex = name.slice('brand-'.length, -'.jpg'.length)
  if (hex === NEUTRAL_ACCENT) return true
  const rows = await db.select({ accent: sites.accent }).from(sites)
  return rows.some(r => accentHex(r.accent) === hex)
}

// Crawler-safe share images (spec 06 FR-087): `/uploads/og/<media-uuid>.jpg` and
// `/uploads/og/brand-<hex>.jpg`, generated on first request. Registered next to the
// `/uploads/` static plugin; Fastify prefers this parametric route over its wildcard.
export async function ogImageRoute(app: FastifyInstance) {
  app.get<{ Params: { name: string } }>('/uploads/og/:name', async (req, reply) => {
    const { name } = req.params
    if (!OG_NAME_PATTERN.test(name)) return reply.code(404).send({ error: 'Not Found' })
    if (name.startsWith('brand-') && !(await isBrandInUse(name))) return reply.code(404).send({ error: 'Not Found' })

    const image = await ensureOgImage(name)
    if (!image) return reply.code(404).send({ error: 'Not Found' })

    // Names are immutable: a new upload gets a new UUID, a new accent a new brand file.
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    reply.type('image/jpeg')
    return reply.sendFile(name, ogDir(), { cacheControl: false })
  })
}
