import type { FastifyInstance } from 'fastify'
import { createShortLink, deleteShortLink, listShortLinks, type ShortLinkActor } from '../../services/short-links.js'
import { sendServiceError } from '../../services/errors.js'

// Admin short-link handlers (spec 05, FR-083). Thin adapters over services/short-links.ts,
// which the remote MCP endpoint calls too, so validation, audit and the `url` field are
// the same on every path. The public redirect `/s/:code` lives in routes/short-links.ts.

function adminOnly(req: any, reply: any, done: any) {
  const role = (req.user as any)?.role
  if (role !== 'admin' && role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

function actorOf(req: any): ShortLinkActor {
  const user = req.user as { sub?: string; email?: string } | undefined
  return { userId: user?.sub ?? null, userEmail: user?.email ?? '', via: 'admin' }
}

export async function adminShortLinksRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, adminOnly]

  // Global listing (also backs the stdio MCP `list_short_links` tool).
  app.get<{ Querystring: { itemId?: string; site?: string; limit?: string } }>(
    '/admin/short-links', { preHandler: auth }, async (req, reply) => {
      try {
        return { shortLinks: await listShortLinks({ contentItemId: req.query.itemId, siteSlug: req.query.site, limit: req.query.limit }) }
      } catch (e) {
        return sendServiceError(reply, e)
      }
    },
  )

  app.get<{ Params: { id: string } }>(
    '/admin/content/:id/short-links', { preHandler: auth }, async (req, reply) => {
      try {
        return { shortLinks: await listShortLinks({ contentItemId: req.params.id, limit: 500 }) }
      } catch (e) {
        return sendServiceError(reply, e)
      }
    },
  )

  app.post<{ Params: { id: string }; Body: { label?: string; siteSlug?: string | null } }>(
    '/admin/content/:id/short-links', { preHandler: auth }, async (req, reply) => {
      try {
        const created = await createShortLink(
          { contentItemId: req.params.id, label: req.body?.label ?? '', siteSlug: req.body?.siteSlug ?? null },
          actorOf(req),
        )
        return reply.code(201).send(created)
      } catch (e) {
        return sendServiceError(reply, e)
      }
    },
  )

  app.delete<{ Params: { id: string; shortLinkId: string } }>(
    '/admin/content/:id/short-links/:shortLinkId', { preHandler: auth }, async (req, reply) => {
      const deleted = await deleteShortLink(req.params.shortLinkId, req.params.id, actorOf(req))
      if (!deleted) return reply.code(404).send({ error: 'Short link not found' })
      return reply.code(204).send()
    },
  )
}
