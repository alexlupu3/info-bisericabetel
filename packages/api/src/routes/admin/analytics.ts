import type { FastifyInstance } from 'fastify'
import { sql } from '../../db/client.js'

function adminOnly(req: any, reply: any, done: any) {
  const role = (req.user as any)?.role
  if (role !== 'admin' && role !== 'super-admin') {
    reply.code(403).send({ error: 'Forbidden' })
    return
  }
  done()
}

export async function adminAnalyticsRoutes(app: FastifyInstance) {
  const auth = [app.authenticate, adminOnly]

  app.get('/admin/analytics/lifetime', { preHandler: auth }, async () => {
    const rows = await sql<{
      event_type: string
      site_slug: string | null
      count: string
    }>`
      SELECT event_type, site_slug, COUNT(*)::int AS count
      FROM analytics_events
      GROUP BY event_type, site_slug
    `

    let totalVisits = 0
    let totalClicks = 0
    const siteMap: Record<string, { visits: number; clicks: number }> = {}

    for (const row of rows) {
      const count = Number(row.count)
      const site = row.site_slug ?? '__all__'

      if (!siteMap[site]) siteMap[site] = { visits: 0, clicks: 0 }

      if (row.event_type === 'site_visit') {
        totalVisits += count
        siteMap[site].visits += count
      } else if (row.event_type === 'link_click') {
        totalClicks += count
        siteMap[site].clicks += count
      }
    }

    const bySite = Object.entries(siteMap).map(([slug, counts]) => ({
      slug: slug === '__all__' ? null : slug,
      ...counts,
    }))

    return { total: { visits: totalVisits, clicks: totalClicks }, bySite }
  })

  app.get<{ Querystring: { days?: string } }>(
    '/admin/analytics/daily', { preHandler: auth }, async (req) => {
      const days = Math.min(Number(req.query.days ?? 30), 90)

      const rows = await sql<{
        day: string
        event_type: string
        count: string
      }>`
        SELECT
          (occurred_at AT TIME ZONE 'UTC')::date AS day,
          event_type,
          COUNT(*)::int AS count
        FROM analytics_events
        WHERE occurred_at >= NOW() - (${days} || ' days')::interval
        GROUP BY day, event_type
        ORDER BY day DESC
      `

      const dayMap: Record<string, { date: string; visits: number; clicks: number }> = {}

      for (const row of rows) {
        const date = row.day.toString().slice(0, 10)
        if (!dayMap[date]) dayMap[date] = { date, visits: 0, clicks: 0 }
        if (row.event_type === 'site_visit') dayMap[date].visits += Number(row.count)
        else if (row.event_type === 'link_click') dayMap[date].clicks += Number(row.count)
      }

      const daily = Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date))

      return { daily, days }
    }
  )

  app.get('/admin/analytics/items', { preHandler: auth }, async () => {
    const rows = await sql<{
      item_id: string | null
      type: string | null
      title: string | null
      clicks: string
    }>`
      SELECT
        ae.item_id,
        ci.type,
        ci.data->>'title' AS title,
        COUNT(*)::int AS clicks
      FROM analytics_events ae
      LEFT JOIN content_items ci ON ci.id = ae.item_id
      WHERE ae.event_type = 'link_click'
        AND ae.item_id IS NOT NULL
      GROUP BY ae.item_id, ci.type, ci.data->>'title'
      ORDER BY clicks DESC
    `

    return {
      items: rows.map(r => ({
        itemId: r.item_id,
        type:   r.type ?? 'unknown',
        title:  r.title ?? '—',
        clicks: Number(r.clicks),
      })),
    }
  })
}
