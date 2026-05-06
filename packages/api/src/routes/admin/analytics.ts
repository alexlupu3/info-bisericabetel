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

  app.get<{ Querystring: { site?: string } }>(
    '/admin/analytics/items', { preHandler: auth }, async (req) => {
    const site = req.query.site || undefined

    const websiteRows = await sql<{
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
        AND ae.short_link_id IS NULL
        ${site ? sql`AND ae.site_slug = ${site}` : sql``}
      GROUP BY ae.item_id, ci.type, ci.data->>'title'
    `

    const shortLinkRows = await sql<{
      item_id: string
      clicks: string
    }>`
      SELECT
        sl.content_item_id AS item_id,
        COUNT(ae.id)::int AS clicks
      FROM short_links sl
      LEFT JOIN analytics_events ae
        ON ae.short_link_id = sl.id
        ${site ? sql`AND ae.site_slug = ${site}` : sql``}
      GROUP BY sl.content_item_id
    `

    const shortLinkMap = new Map<string, number>()
    for (const r of shortLinkRows) shortLinkMap.set(r.item_id, Number(r.clicks))

    // Merge: include items with only short-link clicks too
    const itemMap = new Map<string, { type: string; title: string; websiteClicks: number; shortLinkClicks: number }>()
    for (const r of websiteRows) {
      if (!r.item_id) continue
      itemMap.set(r.item_id, {
        type:            r.type ?? 'unknown',
        title:           r.title ?? '—',
        websiteClicks:   Number(r.clicks),
        shortLinkClicks: shortLinkMap.get(r.item_id) ?? 0,
      })
    }

    // Batch-fetch titles for items that only appear via short-link clicks
    const missingIds = [...shortLinkMap.keys()].filter(id => !itemMap.has(id) && (shortLinkMap.get(id) ?? 0) > 0)
    if (missingIds.length > 0) {
      const ciRows = await sql<{ id: string; type: string | null; title: string | null }>`
        SELECT id, type, data->>'title' AS title FROM content_items WHERE id = ANY(${missingIds})
      `
      for (const ci of ciRows) {
        itemMap.set(ci.id, {
          type:            ci.type ?? 'unknown',
          title:           ci.title ?? '—',
          websiteClicks:   0,
          shortLinkClicks: shortLinkMap.get(ci.id) ?? 0,
        })
      }
    }

    const items = Array.from(itemMap.entries())
      .map(([itemId, v]) => ({
        itemId,
        type:            v.type,
        title:           v.title,
        websiteClicks:   v.websiteClicks,
        shortLinkClicks: v.shortLinkClicks,
        clicks:          v.websiteClicks + v.shortLinkClicks,
      }))
      .sort((a, b) => b.clicks - a.clicks)

    return { items }
  })

  app.get<{ Querystring: { period?: string; site?: string; startDate?: string } }>(
    '/admin/analytics/overview', { preHandler: auth }, async (req, reply) => {
      const period = req.query.period ?? 'week'
      const site = req.query.site || undefined
      const startDate = req.query.startDate || undefined

      if (!startDate && period !== 'day' && period !== 'week' && period !== 'month') {
        return reply.code(400).send({ error: 'Invalid period. Must be day, week, or month.' })
      }

      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return reply.code(400).send({ error: 'Invalid startDate format. Use YYYY-MM-DD.' })
      }

      type ClickBreakdownItem = { itemId: string | null; title: string; clicks: number }
      type SeriesEntry = {
        label: string
        views: number
        clicks: number
        clickBreakdown?: ClickBreakdownItem[]
        otherClicks?: number
      }

      const MAX_BREAKDOWN_PER_BUCKET = 10

      const change = (current: number, previous: number) =>
        previous === 0
          ? (current > 0 ? 100 : 0)
          : Math.round(((current - previous) / previous) * 100)

      const attachBreakdown = (
        series: SeriesEntry[],
        breakdownMap: Map<string, ClickBreakdownItem[]>,
        keyOf: (entry: SeriesEntry) => string,
      ) => {
        for (const entry of series) {
          const items = breakdownMap.get(keyOf(entry))
          if (!items || items.length === 0) continue
          items.sort((a, b) => b.clicks - a.clicks)
          if (items.length > MAX_BREAKDOWN_PER_BUCKET) {
            const top = items.slice(0, MAX_BREAKDOWN_PER_BUCKET)
            const otherClicks = items
              .slice(MAX_BREAKDOWN_PER_BUCKET)
              .reduce((acc, it) => acc + it.clicks, 0)
            entry.clickBreakdown = top
            if (otherClicks > 0) entry.otherClicks = otherClicks
          } else {
            entry.clickBreakdown = items
          }
        }
      }

      if (startDate) {
        const startUtc = new Date(startDate + 'T00:00:00Z')
        if (isNaN(startUtc.getTime()) || startUtc.toISOString().slice(0, 10) !== startDate) {
          return reply.code(400).send({ error: 'Invalid startDate. Use a valid calendar date in YYYY-MM-DD format.' })
        }

        const now = new Date()
        const todayStr = now.toISOString().slice(0, 10)

        const durationDays = Math.max(1, Math.ceil((now.getTime() - startUtc.getTime()) / 86400000))

        const prevEndDate = new Date(startUtc)
        prevEndDate.setUTCDate(prevEndDate.getUTCDate() - 1)
        const prevEndStr = prevEndDate.toISOString().slice(0, 10)

        const prevStartDate = new Date(startUtc)
        prevStartDate.setUTCDate(prevStartDate.getUTCDate() - durationDays)
        const prevStartStr = prevStartDate.toISOString().slice(0, 10)

        const currentDates: string[] = []
        for (let i = 0; i <= durationDays; i++) {
          const d = new Date(startUtc)
          d.setUTCDate(d.getUTCDate() + i)
          const s = d.toISOString().slice(0, 10)
          if (s <= todayStr) currentDates.push(s)
        }

        const previousDates: string[] = []
        for (let i = 0; i <= durationDays; i++) {
          const d = new Date(prevStartDate)
          d.setUTCDate(d.getUTCDate() + i)
          const s = d.toISOString().slice(0, 10)
          if (s <= prevEndStr) previousDates.push(s)
        }

        const currentMap = new Map<string, { views: number; clicks: number }>()
        const previousMap = new Map<string, { views: number; clicks: number }>()
        for (const date of currentDates) currentMap.set(date, { views: 0, clicks: 0 })
        for (const date of previousDates) previousMap.set(date, { views: 0, clicks: 0 })

        const rows = await sql<{ day: string; event_type: string; count: number }>`
          SELECT
            (occurred_at AT TIME ZONE 'UTC')::date AS day,
            event_type,
            COUNT(*)::int AS count
          FROM analytics_events
          WHERE (occurred_at AT TIME ZONE 'UTC')::date >= ${startDate}::date
            ${site ? sql`AND site_slug = ${site}` : sql``}
          GROUP BY day, event_type
          ORDER BY day ASC
        `

        const prevRows = await sql<{ day: string; event_type: string; count: number }>`
          SELECT
            (occurred_at AT TIME ZONE 'UTC')::date AS day,
            event_type,
            COUNT(*)::int AS count
          FROM analytics_events
          WHERE (occurred_at AT TIME ZONE 'UTC')::date BETWEEN ${prevStartStr}::date AND ${prevEndStr}::date
            ${site ? sql`AND site_slug = ${site}` : sql``}
          GROUP BY day, event_type
          ORDER BY day ASC
        `

        for (const row of rows) {
          const dayStr = row.day.toString().slice(0, 10)
          const entry = currentMap.get(dayStr)
          if (!entry) continue
          if (row.event_type === 'site_visit') entry.views += Number(row.count)
          else if (row.event_type === 'link_click') entry.clicks += Number(row.count)
        }

        for (const row of prevRows) {
          const dayStr = row.day.toString().slice(0, 10)
          const entry = previousMap.get(dayStr)
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

        const breakdownRows = await sql<{
          day: string
          item_id: string | null
          title: string | null
          clicks: number
        }>`
          SELECT
            (ae.occurred_at AT TIME ZONE 'UTC')::date AS day,
            ae.item_id,
            ci.data->>'title' AS title,
            COUNT(*)::int AS clicks
          FROM analytics_events ae
          LEFT JOIN content_items ci ON ci.id = ae.item_id
          WHERE ae.event_type = 'link_click'
            AND (ae.occurred_at AT TIME ZONE 'UTC')::date >= ${startDate}::date
            ${site ? sql`AND ae.site_slug = ${site}` : sql``}
          GROUP BY day, ae.item_id, ci.data->>'title'
        `

        const breakdownMap = new Map<string, ClickBreakdownItem[]>()
        for (const row of breakdownRows) {
          const key = row.day.toString().slice(0, 10)
          const list = breakdownMap.get(key) ?? []
          list.push({ itemId: row.item_id, title: row.title ?? '—', clicks: Number(row.clicks) })
          breakdownMap.set(key, list)
        }
        attachBreakdown(currentSeries, breakdownMap, (e) => e.label)

        const sum = (series: SeriesEntry[], key: 'views' | 'clicks') =>
          series.reduce((acc, s) => acc + s[key], 0)

        const currentViews = sum(currentSeries, 'views')
        const currentClicks = sum(currentSeries, 'clicks')
        const previousViews = sum(previousSeries, 'views')
        const previousClicks = sum(previousSeries, 'clicks')

        return {
          period: 'custom' as const,
          current: { views: currentViews, clicks: currentClicks, series: currentSeries },
          previous: { views: previousViews, clicks: previousClicks, series: previousSeries },
          viewsChange: change(currentViews, previousViews),
          clicksChange: change(currentClicks, previousClicks),
        }
      }

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
            ${site ? sql`AND site_slug = ${site}` : sql``}
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

        const breakdownRows = await sql<{
          hour: number
          item_id: string | null
          title: string | null
          clicks: number
        }>`
          SELECT
            EXTRACT(HOUR FROM ae.occurred_at AT TIME ZONE 'UTC')::int AS hour,
            ae.item_id,
            ci.data->>'title' AS title,
            COUNT(*)::int AS clicks
          FROM analytics_events ae
          LEFT JOIN content_items ci ON ci.id = ae.item_id
          WHERE ae.event_type = 'link_click'
            AND ae.occurred_at >= (CURRENT_DATE AT TIME ZONE 'UTC')
            ${site ? sql`AND ae.site_slug = ${site}` : sql``}
          GROUP BY hour, ae.item_id, ci.data->>'title'
        `

        const breakdownMap = new Map<string, ClickBreakdownItem[]>()
        for (const row of breakdownRows) {
          const key = String(row.hour).padStart(2, '0')
          const list = breakdownMap.get(key) ?? []
          list.push({
            itemId: row.item_id,
            title: row.title ?? '—',
            clicks: Number(row.clicks),
          })
          breakdownMap.set(key, list)
        }
        attachBreakdown(currentSeries, breakdownMap, (e) => e.label)

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
          ${site ? sql`AND site_slug = ${site}` : sql``}
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
        const bucket = dayStr > cutoffStr ? currentMap : previousMap
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

      const breakdownRows = await sql<{
        day: string
        item_id: string | null
        title: string | null
        clicks: number
      }>`
        SELECT
          (ae.occurred_at AT TIME ZONE 'UTC')::date AS day,
          ae.item_id,
          ci.data->>'title' AS title,
          COUNT(*)::int AS clicks
        FROM analytics_events ae
        LEFT JOIN content_items ci ON ci.id = ae.item_id
        WHERE ae.event_type = 'link_click'
          AND (ae.occurred_at AT TIME ZONE 'UTC')::date >= ${cutoffStr}::date
          ${site ? sql`AND ae.site_slug = ${site}` : sql``}
        GROUP BY day, ae.item_id, ci.data->>'title'
      `

      const breakdownMap = new Map<string, ClickBreakdownItem[]>()
      for (const row of breakdownRows) {
        const key = row.day.toString().slice(0, 10)
        const list = breakdownMap.get(key) ?? []
        list.push({
          itemId: row.item_id,
          title: row.title ?? '—',
          clicks: Number(row.clicks),
        })
        breakdownMap.set(key, list)
      }
      attachBreakdown(currentSeries, breakdownMap, (e) => e.label)

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

  app.get<{ Params: { itemId: string }; Querystring: { site?: string } }>(
    '/admin/analytics/items/:itemId/export', { preHandler: auth }, async (req, reply) => {
      const site = req.query.site || undefined
      const rows = await sql<{
        occurred_at: Date
        site_slug: string | null
        title: string | null
        url: string | null
        short_link_id: string | null
        short_link_label: string | null
        short_link_code: string | null
      }>`
        SELECT
          ae.occurred_at,
          ae.site_slug,
          ci.data->>'title' AS title,
          ae.url,
          ae.short_link_id,
          sl.label AS short_link_label,
          sl.code AS short_link_code
        FROM analytics_events ae
        LEFT JOIN content_items ci ON ci.id = ae.item_id
        LEFT JOIN short_links sl ON sl.id = ae.short_link_id
        WHERE ae.event_type = 'link_click'
          AND ae.item_id = ${req.params.itemId}
          ${site ? sql`AND ae.site_slug = ${site}` : sql``}
        ORDER BY ae.occurred_at DESC
      `

      const escape = (v: string | null | undefined) => {
        if (v === null || v === undefined) return ''
        const s = String(v)
        const needsQuoting = s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
        const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
        return needsQuoting
          ? `"${safe.replace(/"/g, '""')}"`
          : safe
      }

      const lines = ['Timestamp,Site,Titlu,URL,Sursa,Cod link scurt']
      for (const row of rows) {
        const source = row.short_link_label ?? (row.short_link_id ? 'link scurt (șters)' : 'website')
        lines.push([
          escape(new Date(row.occurred_at).toISOString()),
          escape(row.site_slug),
          escape(row.title),
          escape(row.url),
          escape(source),
          escape(row.short_link_code),
        ].join(','))
      }

      const date = new Date().toISOString().slice(0, 10)
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="clickuri-${req.params.itemId}-${date}.csv"`)
      return reply.send(lines.join('\n'))
    }
  )

  app.get<{ Querystring: { period?: string; startDate?: string } }>(
    '/admin/analytics/sites-comparison', { preHandler: auth }, async (req, reply) => {
      const period = req.query.period ?? 'week'
      const startDate = req.query.startDate || undefined

      if (!startDate && period !== 'day' && period !== 'week' && period !== 'month') {
        return reply.code(400).send({ error: 'Invalid period.' })
      }

      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return reply.code(400).send({ error: 'Invalid startDate format. Use YYYY-MM-DD.' })
      }

      const sites = await sql<{ slug: string; name: string; accent: string }>`
        SELECT slug, name, accent FROM sites ORDER BY name
      `

      type SitePoint = { views: number; clicks: number }
      type SeriesPoint = { label: string; sites: Record<string, SitePoint>; total: SitePoint }

      const buildPoint = (): SitePoint => ({ views: 0, clicks: 0 })

      if (startDate) {
        const startUtc = new Date(startDate + 'T00:00:00Z')
        if (isNaN(startUtc.getTime()) || startUtc.toISOString().slice(0, 10) !== startDate) {
          return reply.code(400).send({ error: 'Invalid startDate. Use a valid calendar date in YYYY-MM-DD format.' })
        }

        const now = new Date()
        const todayStr = now.toISOString().slice(0, 10)

        const dateSet: string[] = []
        const durationDays = Math.max(1, Math.ceil((now.getTime() - startUtc.getTime()) / 86400000))
        for (let i = 0; i <= durationDays; i++) {
          const d = new Date(startUtc)
          d.setUTCDate(d.getUTCDate() + i)
          const s = d.toISOString().slice(0, 10)
          if (s <= todayStr) dateSet.push(s)
        }

        const rows = await sql<{
          day: string
          site_slug: string | null
          event_type: string
          count: number
        }>`
          SELECT
            (occurred_at AT TIME ZONE 'UTC')::date AS day,
            site_slug,
            event_type,
            COUNT(*)::int AS count
          FROM analytics_events
          WHERE (occurred_at AT TIME ZONE 'UTC')::date >= ${startDate}::date
          GROUP BY day, site_slug, event_type
          ORDER BY day ASC
        `

        const pointMap = new Map<string, SeriesPoint>()
        for (const date of dateSet) {
          const siteData: Record<string, SitePoint> = {}
          for (const s of sites) siteData[s.slug] = buildPoint()
          pointMap.set(date, { label: date, sites: siteData, total: buildPoint() })
        }

        for (const row of rows) {
          const dateStr = row.day.toString().slice(0, 10)
          const point = pointMap.get(dateStr)
          if (!point) continue
          const count = Number(row.count)
          if (row.event_type === 'site_visit') {
            point.total.views += count
            if (row.site_slug && point.sites[row.site_slug]) point.sites[row.site_slug].views += count
          } else if (row.event_type === 'link_click') {
            point.total.clicks += count
            if (row.site_slug && point.sites[row.site_slug]) point.sites[row.site_slug].clicks += count
          }
        }

        return { period: 'custom' as const, sites, series: Array.from(pointMap.values()) }
      }

      if (period === 'day') {
        const rows = await sql<{
          hour: number
          site_slug: string | null
          event_type: string
          count: number
        }>`
          SELECT
            EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'UTC')::int AS hour,
            site_slug,
            event_type,
            COUNT(*)::int AS count
          FROM analytics_events
          WHERE occurred_at >= CURRENT_DATE AT TIME ZONE 'UTC'
          GROUP BY hour, site_slug, event_type
          ORDER BY hour ASC
        `

        const pointMap = new Map<number, SeriesPoint>()
        for (let h = 0; h < 24; h++) {
          const siteData: Record<string, SitePoint> = {}
          for (const s of sites) siteData[s.slug] = buildPoint()
          pointMap.set(h, { label: String(h).padStart(2, '0'), sites: siteData, total: buildPoint() })
        }

        for (const row of rows) {
          const point = pointMap.get(row.hour)!
          const count = Number(row.count)
          if (row.event_type === 'site_visit') {
            point.total.views += count
            if (row.site_slug && point.sites[row.site_slug]) point.sites[row.site_slug].views += count
          } else if (row.event_type === 'link_click') {
            point.total.clicks += count
            if (row.site_slug && point.sites[row.site_slug]) point.sites[row.site_slug].clicks += count
          }
        }

        return { period, sites, series: Array.from(pointMap.values()) }
      }

      const days = period === 'week' ? 7 : 30

      const rows = await sql<{
        day: string
        site_slug: string | null
        event_type: string
        count: number
      }>`
        SELECT
          (occurred_at AT TIME ZONE 'UTC')::date AS day,
          site_slug,
          event_type,
          COUNT(*)::int AS count
        FROM analytics_events
        WHERE occurred_at >= NOW() - (${days} || ' days')::interval
        GROUP BY day, site_slug, event_type
        ORDER BY day ASC
      `

      const dateSet: string[] = []
      const now = new Date()
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now)
        d.setUTCDate(d.getUTCDate() - i)
        dateSet.push(d.toISOString().slice(0, 10))
      }

      const pointMap = new Map<string, SeriesPoint>()
      for (const date of dateSet) {
        const siteData: Record<string, SitePoint> = {}
        for (const s of sites) siteData[s.slug] = buildPoint()
        pointMap.set(date, { label: date, sites: siteData, total: buildPoint() })
      }

      for (const row of rows) {
        const dateStr = row.day.toString().slice(0, 10)
        const point = pointMap.get(dateStr)
        if (!point) continue
        const count = Number(row.count)
        if (row.event_type === 'site_visit') {
          point.total.views += count
          if (row.site_slug && point.sites[row.site_slug]) point.sites[row.site_slug].views += count
        } else if (row.event_type === 'link_click') {
          point.total.clicks += count
          if (row.site_slug && point.sites[row.site_slug]) point.sites[row.site_slug].clicks += count
        }
      }

      return { period, sites, series: Array.from(pointMap.values()) }
    }
  )

  app.get<{ Params: { itemId: string }; Querystring: { site?: string } }>(
    '/admin/analytics/items/:itemId/daily', { preHandler: auth }, async (req) => {
      const site = req.query.site || undefined
      const itemId = req.params.itemId

      // Website clicks per day (no short_link_id)
      const websiteRows = await sql<{ day: string; clicks: string }>`
        SELECT
          (occurred_at AT TIME ZONE 'UTC')::date AS day,
          COUNT(*)::int AS clicks
        FROM analytics_events
        WHERE event_type = 'link_click'
          AND item_id = ${itemId}
          AND short_link_id IS NULL
          AND occurred_at >= NOW() - INTERVAL '90 days'
          ${site ? sql`AND site_slug = ${site}` : sql``}
        GROUP BY day
        ORDER BY day ASC
      `

      // Short link clicks per day, grouped by short link label
      const shortLinkRows = await sql<{ day: string; short_link_id: string; label: string; clicks: string }>`
        SELECT
          (ae.occurred_at AT TIME ZONE 'UTC')::date AS day,
          sl.id AS short_link_id,
          sl.label,
          COUNT(ae.id)::int AS clicks
        FROM analytics_events ae
        JOIN short_links sl ON sl.id = ae.short_link_id
        WHERE ae.event_type = 'link_click'
          AND sl.content_item_id = ${itemId}
          AND ae.occurred_at >= NOW() - INTERVAL '90 days'
          ${site ? sql`AND ae.site_slug = ${site}` : sql``}
        GROUP BY day, sl.id, sl.label
        ORDER BY day ASC
      `

      // Collect all distinct short links for this item
      const shortLinkMeta = new Map<string, string>() // id → label
      for (const r of shortLinkRows) shortLinkMeta.set(r.short_link_id, r.label)

      // Build a unified date set
      const dateSet = new Set<string>()
      for (const r of websiteRows) dateSet.add(r.day.toString().slice(0, 10))
      for (const r of shortLinkRows) dateSet.add(r.day.toString().slice(0, 10))

      // Build daily map
      type DayEntry = { date: string; website: number; [shortLinkId: string]: number | string }
      const dayMap = new Map<string, DayEntry>()
      for (const date of dateSet) dayMap.set(date, { date, website: 0 })

      for (const r of websiteRows) {
        const date = r.day.toString().slice(0, 10)
        const entry = dayMap.get(date)!
        entry.website = Number(r.clicks)
      }
      for (const r of shortLinkRows) {
        const date = r.day.toString().slice(0, 10)
        const entry = dayMap.get(date)!
        entry[r.short_link_id] = Number(r.clicks)
      }

      const daily = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date))
      const shortLinks = Array.from(shortLinkMeta.entries()).map(([id, label]) => ({ id, label }))

      return { itemId, daily, shortLinks }
    }
  )
}
