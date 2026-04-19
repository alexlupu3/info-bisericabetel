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

  app.get<{ Querystring: { period?: string } }>(
    '/admin/analytics/overview', { preHandler: auth }, async (req, reply) => {
      const period = req.query.period ?? 'week'

      if (period !== 'day' && period !== 'week' && period !== 'month') {
        return reply.code(400).send({ error: 'Invalid period. Must be day, week, or month.' })
      }

      type SeriesEntry = { label: string; views: number; clicks: number }

      const change = (current: number, previous: number) =>
        previous === 0
          ? (current > 0 ? 100 : 0)
          : Math.round(((current - previous) / previous) * 100)

      if (period === 'day') {
        const rows = await sql<{
          day: string
          hour: number
          event_type: string
          count: number
        }>`
          SELECT
            (occurred_at AT TIME ZONE 'UTC')::date AS day,
            EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'UTC')::int AS hour,
            event_type,
            COUNT(*)::int AS count
          FROM analytics_events
          WHERE occurred_at >= (CURRENT_DATE AT TIME ZONE 'UTC') - INTERVAL '1 day'
          GROUP BY day, hour, event_type
          ORDER BY day ASC, hour ASC
        `

        const today = new Date()
        const todayStr = today.toISOString().slice(0, 10)
        const yesterday = new Date(today)
        yesterday.setUTCDate(yesterday.getUTCDate() - 1)
        const yesterdayStr = yesterday.toISOString().slice(0, 10)

        const currentMap = new Map<number, { views: number; clicks: number }>()
        const previousMap = new Map<number, { views: number; clicks: number }>()

        for (let h = 0; h < 24; h++) {
          currentMap.set(h, { views: 0, clicks: 0 })
          previousMap.set(h, { views: 0, clicks: 0 })
        }

        for (const row of rows) {
          const dayStr = row.day.toString().slice(0, 10)
          const bucket = dayStr === todayStr ? currentMap : previousMap
          const entry = bucket.get(row.hour)!
          if (row.event_type === 'site_visit') entry.views += Number(row.count)
          else if (row.event_type === 'link_click') entry.clicks += Number(row.count)
        }

        const buildSeries = (map: Map<number, { views: number; clicks: number }>): SeriesEntry[] => {
          const series: SeriesEntry[] = []
          for (let h = 0; h < 24; h++) {
            const entry = map.get(h)!
            series.push({ label: String(h).padStart(2, '0'), views: entry.views, clicks: entry.clicks })
          }
          return series
        }

        const currentSeries = buildSeries(currentMap)
        const previousSeries = buildSeries(previousMap)

        const sum = (series: SeriesEntry[], key: 'views' | 'clicks') =>
          series.reduce((acc, s) => acc + s[key], 0)

        const currentViews = sum(currentSeries, 'views')
        const currentClicks = sum(currentSeries, 'clicks')
        const previousViews = sum(previousSeries, 'views')
        const previousClicks = sum(previousSeries, 'clicks')

        return {
          period,
          current: { views: currentViews, clicks: currentClicks, series: currentSeries },
          previous: { views: previousViews, clicks: previousClicks, series: previousSeries },
          viewsChange: change(currentViews, previousViews),
          clicksChange: change(currentClicks, previousClicks),
        }
      }

      // week or month
      const totalDays = period === 'week' ? 14 : 60
      const halfDays = totalDays / 2

      const rows = await sql<{
        day: string
        event_type: string
        count: number
      }>`
        SELECT
          (occurred_at AT TIME ZONE 'UTC')::date AS day,
          event_type,
          COUNT(*)::int AS count
        FROM analytics_events
        WHERE occurred_at >= NOW() - (${totalDays} || ' days')::interval
        GROUP BY day, event_type
        ORDER BY day ASC
      `

      const now = new Date()
      const cutoff = new Date(now)
      cutoff.setUTCDate(cutoff.getUTCDate() - halfDays)
      const cutoffStr = cutoff.toISOString().slice(0, 10)

      // Build date lists for current and previous periods
      const currentDates: string[] = []
      const previousDates: string[] = []

      for (let i = 0; i < halfDays; i++) {
        const d = new Date(now)
        d.setUTCDate(d.getUTCDate() - i)
        currentDates.push(d.toISOString().slice(0, 10))
      }
      for (let i = halfDays; i < totalDays; i++) {
        const d = new Date(now)
        d.setUTCDate(d.getUTCDate() - i)
        previousDates.push(d.toISOString().slice(0, 10))
      }

      currentDates.sort()
      previousDates.sort()

      const currentMap = new Map<string, { views: number; clicks: number }>()
      const previousMap = new Map<string, { views: number; clicks: number }>()

      for (const date of currentDates) currentMap.set(date, { views: 0, clicks: 0 })
      for (const date of previousDates) previousMap.set(date, { views: 0, clicks: 0 })

      for (const row of rows) {
        const dayStr = row.day.toString().slice(0, 10)
        const bucket = dayStr >= cutoffStr ? currentMap : previousMap
        const entry = bucket.get(dayStr)
        if (!entry) continue
        if (row.event_type === 'site_visit') entry.views += Number(row.count)
        else if (row.event_type === 'link_click') entry.clicks += Number(row.count)
      }

      const buildSeries = (map: Map<string, { views: number; clicks: number }>): SeriesEntry[] =>
        Array.from(map.entries()).map(([label, entry]) => ({
          label,
          views: entry.views,
          clicks: entry.clicks,
        }))

      const currentSeries = buildSeries(currentMap)
      const previousSeries = buildSeries(previousMap)

      const sum = (series: SeriesEntry[], key: 'views' | 'clicks') =>
        series.reduce((acc, s) => acc + s[key], 0)

      const currentViews = sum(currentSeries, 'views')
      const currentClicks = sum(currentSeries, 'clicks')
      const previousViews = sum(previousSeries, 'views')
      const previousClicks = sum(previousSeries, 'clicks')

      return {
        period,
        current: { views: currentViews, clicks: currentClicks, series: currentSeries },
        previous: { views: previousViews, clicks: previousClicks, series: previousSeries },
        viewsChange: change(currentViews, previousViews),
        clicksChange: change(currentClicks, previousClicks),
      }
    }
  )

  app.get<{ Params: { itemId: string } }>(
    '/admin/analytics/items/:itemId/daily', { preHandler: auth }, async (req) => {
      const rows = await sql<{ day: string; clicks: number }>`
        SELECT
          (occurred_at AT TIME ZONE 'UTC')::date AS day,
          COUNT(*)::int AS clicks
        FROM analytics_events
        WHERE event_type = 'link_click'
          AND item_id = ${req.params.itemId}
          AND occurred_at >= NOW() - INTERVAL '90 days'
        GROUP BY day
        ORDER BY day ASC
      `

      return {
        itemId: req.params.itemId,
        daily: rows.map(r => ({
          date: r.day.toString().slice(0, 10),
          clicks: Number(r.clicks),
        })),
      }
    }
  )
}
