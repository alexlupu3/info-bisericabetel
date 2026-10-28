import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { sites } from '../../db/schema.js'

function superAdminOnly(req: any, reply: any, done: any) {
  if ((req.user as any)?.role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

// Optional text columns of a site: '' or null clears the value (stored as NULL).
const TEXT_FIELDS = ['address', 'streetAddress', 'postalCode', 'addressLocality', 'addressRegion', 'telephone', 'email'] as const
const TEXT_MAX = 200

type SiteBody = {
  name?: string
  accent?: string
  address?: string | null
  streetAddress?: string | null
  postalCode?: string | null
  addressLocality?: string | null
  addressRegion?: string | null
  addressCountry?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  telephone?: string | null
  email?: string | null
}

function parseCoordinate(value: unknown, field: 'latitude' | 'longitude'): { value: number | null } | { error: string } {
  if (value === null || value === '') return { value: null }
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim().replace(',', '.')) : NaN
  const limit = field === 'latitude' ? 90 : 180
  if (!Number.isFinite(n) || Math.abs(n) > limit) return { error: `${field} must be a number between -${limit} and ${limit}` }
  return { value: n }
}

/** Validated column updates for PATCH /api/admin/sites/:slug, or an error message. */
export function siteUpdates(body: SiteBody): { updates: Record<string, unknown> } | { error: string } {
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.accent !== undefined) updates.accent = body.accent

  for (const field of TEXT_FIELDS) {
    const value = body[field]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') return { error: `${field} must be a string` }
    const trimmed = value?.trim() ?? ''
    if (trimmed.length > TEXT_MAX) return { error: `${field} must be at most ${TEXT_MAX} characters` }
    updates[field] = trimmed || null
  }

  if (body.addressCountry !== undefined) {
    const c = body.addressCountry?.trim().toUpperCase() ?? ''
    if (c && !/^[A-Z]{2}$/.test(c)) return { error: 'addressCountry must be an ISO 3166-1 alpha-2 code (e.g. RO)' }
    updates.addressCountry = c || null
  }

  for (const field of ['latitude', 'longitude'] as const) {
    if (body[field] === undefined) continue
    const parsed = parseCoordinate(body[field], field)
    if ('error' in parsed) return parsed
    updates[field] = parsed.value
  }

  const lat = updates.latitude !== undefined ? updates.latitude : undefined
  const lng = updates.longitude !== undefined ? updates.longitude : undefined
  if ((lat === null) !== (lng === null) && lat !== undefined && lng !== undefined) {
    return { error: 'latitude and longitude must be set together' }
  }
  return { updates }
}

export async function adminSitesRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, superAdminOnly]

  app.patch<{ Params: { slug: string }; Body: SiteBody }>(
    '/admin/sites/:slug', { preHandler: auth }, async (req, reply) => {
      const { slug } = req.params

      const [existing] = await db.select().from(sites).where(eq(sites.slug, slug))
      if (!existing) return reply.code(404).send({ error: 'Site not found' })

      const result = siteUpdates(req.body ?? {})
      if ('error' in result) return reply.code(400).send({ error: result.error })
      const { updates } = result

      if (Object.keys(updates).length === 0) return existing

      const [updated] = await db.update(sites).set(updates).where(eq(sites.slug, slug)).returning()
      return updated
    }
  )
}
