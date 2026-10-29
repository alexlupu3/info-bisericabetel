// Range analytics (spec 05 §6.3–6.4, FR-080–FR-082, BR-040): the four query functions
// behind the REST endpoints `/api/admin/analytics/{range,items/:id/stats,top-items,short-links}`
// and the MCP tools of the same purpose. REST and remote MCP return these results
// untouched, so the surfaces agree by construction (ADR-024).
//
// Range predicates stay sargable on `occurred_at` (bounds computed with dayStart());
// buckets use `occurred_at AT TIME ZONE tz` only in SELECT / GROUP BY (ADR-017).

import type { AnalyticsItemIdentity, ItemStats, OverviewStats, ShortLinkStats, TopItems } from '@betel/shared'
import { readLocation } from '@betel/shared'
import { sql } from '../db/client.js'
import { addDays } from './time.js'
import { bucketLabels, changePct, parseLimit, rangeOutput, resolveRange, type RangeInput, type ResolvedRange } from './analytics-range.js'
import { isUuid, NotFoundError, ValidationError } from './errors.js'
import { shortLinkUrl } from './short-links.js'

export { resolveRange, type RangeInput } from './analytics-range.js'

const CONTENT_TYPES = ['card', 'poster', 'richtext', 'video']
const TOP_ITEMS_DEFAULT = 10
const TOP_ITEMS_MAX = 50
const SHORT_LINK_STATS_MAX = 50

/** The instant at which calendar day `day` begins in `tz`, as a SQL fragment. */
export const dayStart = (day: string, tz: string) => sql`(${day}::timestamp AT TIME ZONE ${tz})`

// `ae.occurred_at` within the inclusive calendar days from..to in tz.
const inDays = (from: string, to: string, tz: string) =>
  sql`ae.occurred_at >= ${dayStart(from, tz)} AND ae.occurred_at < ${dayStart(addDays(to, 1), tz)}`

const inRange = (r: ResolvedRange) => inDays(r.from, r.to, r.timeZone)
const inPrevious = (r: ResolvedRange) => inDays(r.prevFrom, r.prevTo, r.timeZone)

// Bucket label (YYYY-MM-DD text, so postgres-js does not return a Date), clamped to `from`.
const bucket = (r: ResolvedRange) =>
  sql`GREATEST(date_trunc(${r.granularity}, ae.occurred_at AT TIME ZONE ${r.timeZone})::date, ${r.from}::date)::text`

const siteFilter = (site: string | undefined) => (site ? sql`AND ae.site_slug = ${site}` : sql``)

async function assertSite(site: string | undefined): Promise<void> {
  if (!site) return
  const [row] = await sql`SELECT 1 FROM sites WHERE slug = ${site}`
  if (!row) throw new ValidationError(`site "${site}" not found`)
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function identity(type: string, state: string, data: Record<string, unknown>): AnalyticsItemIdentity {
  return {
    type,
    title: str(data.title),
    state,
    startDate: str(data.startDate),
    startTime: str(data.startTime),
    location: readLocation(data),
  }
}

async function findActiveItem(itemId: string) {
  if (!isUuid(itemId)) throw new NotFoundError(`content item "${itemId}" not found`)
  const [row] = await sql<{ id: string; type: string; state: string; data: Record<string, unknown> }[]>`
    SELECT id, type, state, data FROM content_items WHERE id = ${itemId} AND state <> 'deleted'
  `
  if (!row) throw new NotFoundError(`content item "${itemId}" not found`)
  return row
}

// Timestamps are selected as ISO 8601 text (to_char … 'UTC'): the shared postgres-js client
// returns timestamptz columns as Postgres-format strings (drizzle's parsers), not Dates.

// ── get_analytics_overview ──────────────────────────────────────

export async function getAnalyticsOverview(input: RangeInput & { site?: string }): Promise<OverviewStats> {
  const r = resolveRange(input)
  const site = input.site || undefined
  await assertSite(site)

  const [rows, prevRows, seriesRows, siteRows] = await Promise.all([
    sql<{ event_type: string; site_slug: string | null; count: number }[]>`
      SELECT ae.event_type, ae.site_slug, COUNT(*)::int AS count
      FROM analytics_events ae
      WHERE ${inRange(r)} ${siteFilter(site)}
      GROUP BY ae.event_type, ae.site_slug
    `,
    r.compare
      ? sql<{ event_type: string; count: number }[]>`
          SELECT ae.event_type, COUNT(*)::int AS count
          FROM analytics_events ae
          WHERE ${inPrevious(r)} ${siteFilter(site)}
            AND ae.event_type IN ('site_visit', 'link_click')
          GROUP BY ae.event_type
        `
      : Promise.resolve([]),
    sql<{ bucket: string; event_type: string; count: number }[]>`
      SELECT ${bucket(r)} AS bucket, ae.event_type, COUNT(*)::int AS count
      FROM analytics_events ae
      WHERE ${inRange(r)} ${siteFilter(site)}
        AND ae.event_type IN ('site_visit', 'link_click')
      GROUP BY 1, 2
    `,
    sql<{ slug: string; name: string }[]>`
      SELECT slug, name FROM sites ${site ? sql`WHERE slug = ${site}` : sql``} ORDER BY name, slug
    `,
  ])

  const byEventType: Record<string, number> = {}
  const siteCounts = new Map<string | null, { views: number; clicks: number }>()
  for (const row of rows) {
    byEventType[row.event_type] = (byEventType[row.event_type] ?? 0) + row.count
    const entry = siteCounts.get(row.site_slug) ?? { views: 0, clicks: 0 }
    if (row.event_type === 'site_visit') entry.views += row.count
    else if (row.event_type === 'link_click') entry.clicks += row.count
    siteCounts.set(row.site_slug, entry)
  }
  const sortedTypes = Object.fromEntries(Object.entries(byEventType).sort(([a], [b]) => a.localeCompare(b)))
  const views = byEventType.site_visit ?? 0
  const clicks = byEventType.link_click ?? 0

  let previous: OverviewStats['previous'] = null
  if (r.compare) {
    const prevViews = prevRows.find(p => p.event_type === 'site_visit')?.count ?? 0
    const prevClicks = prevRows.find(p => p.event_type === 'link_click')?.count ?? 0
    previous = {
      from: r.prevFrom,
      to: r.prevTo,
      views: prevViews,
      clicks: prevClicks,
      viewsChangePct: changePct(views, prevViews),
      clicksChangePct: changePct(clicks, prevClicks),
    }
  }

  // One row per site (zeros included), then slugs of removed sites, then the all-sites view.
  const bySite: OverviewStats['bySite'] = siteRows.map(s => ({
    site: s.slug, name: s.name, ...(siteCounts.get(s.slug) ?? { views: 0, clicks: 0 }),
  }))
  const known = new Set(siteRows.map(s => s.slug))
  for (const slug of [...siteCounts.keys()].filter((k): k is string => k !== null && !known.has(k)).sort()) {
    bySite.push({ site: slug, name: null, ...siteCounts.get(slug)! })
  }
  if (!site) bySite.push({ site: null, name: null, ...(siteCounts.get(null) ?? { views: 0, clicks: 0 }) })

  const seriesMap = new Map(bucketLabels(r.from, r.to, r.granularity).map(b => [b, { bucket: b, views: 0, clicks: 0 }]))
  for (const row of seriesRows) {
    const entry = seriesMap.get(row.bucket)
    if (!entry) continue
    if (row.event_type === 'site_visit') entry.views += row.count
    else entry.clicks += row.count
  }

  return {
    range: rangeOutput(r),
    site: site ?? null,
    totals: { views, clicks, byEventType: sortedTypes },
    previous,
    bySite,
    series: [...seriesMap.values()],
  }
}

// ── get_item_stats ──────────────────────────────────────────────

export async function getItemStats(input: RangeInput & { itemId: string; site?: string }): Promise<ItemStats> {
  const r = resolveRange(input)
  const site = input.site || undefined
  const item = await findActiveItem(input.itemId)
  await assertSite(site)

  const clickFilter = sql`ae.event_type = 'link_click' AND ae.item_id = ${item.id} ${siteFilter(site)}`

  const [rows, prevRows, allTimeRows, links] = await Promise.all([
    sql<{ short_link_id: string | null; site_slug: string | null; bucket: string; count: number }[]>`
      SELECT ae.short_link_id, ae.site_slug, ${bucket(r)} AS bucket, COUNT(*)::int AS count
      FROM analytics_events ae
      WHERE ${clickFilter} AND ${inRange(r)}
      GROUP BY 1, 2, 3
    `,
    r.compare
      ? sql<{ count: number }[]>`
          SELECT COUNT(*)::int AS count FROM analytics_events ae WHERE ${clickFilter} AND ${inPrevious(r)}
        `
      : Promise.resolve([]),
    sql<{ clicks: number; website: number; first: string | null }[]>`
      SELECT COUNT(*)::int AS clicks,
             (COUNT(*) FILTER (WHERE ae.short_link_id IS NULL))::int AS website,
             to_char(MIN(ae.occurred_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS first
      FROM analytics_events ae
      WHERE ${clickFilter}
    `,
    sql<{ id: string; code: string; label: string; site_slug: string | null }[]>`
      SELECT id, code, label, site_slug FROM short_links
      WHERE content_item_id = ${item.id}
      ORDER BY created_at, id
    `,
  ])

  const totals = { clicks: 0, websiteClicks: 0, shortLinkClicks: 0 }
  const siteClicks = new Map<string | null, number>()
  const linkClicks = new Map<string, number>()
  const seriesMap = new Map(bucketLabels(r.from, r.to, r.granularity)
    .map(b => [b, { bucket: b, clicks: 0, websiteClicks: 0, shortLinkClicks: 0 }]))

  for (const row of rows) {
    const website = row.short_link_id === null
    totals.clicks += row.count
    if (website) totals.websiteClicks += row.count
    else {
      totals.shortLinkClicks += row.count
      linkClicks.set(row.short_link_id!, (linkClicks.get(row.short_link_id!) ?? 0) + row.count)
    }
    siteClicks.set(row.site_slug, (siteClicks.get(row.site_slug) ?? 0) + row.count)
    const entry = seriesMap.get(row.bucket)
    if (entry) {
      entry.clicks += row.count
      if (website) entry.websiteClicks += row.count
      else entry.shortLinkClicks += row.count
    }
  }

  const bySite = [...siteClicks.entries()]
    .map(([s, clicks]) => ({ site: s, clicks }))
    .sort((a, b) => b.clicks - a.clicks
      || (a.site === null ? 1 : b.site === null ? -1 : a.site.localeCompare(b.site)))

  const shortLinkSources = links
    .map(l => ({
      source: 'short_link' as const,
      shortLinkId: l.id,
      code: l.code,
      label: l.label,
      siteSlug: l.site_slug,
      url: shortLinkUrl(l.code),
      clicks: linkClicks.get(l.id) ?? 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || a.code.localeCompare(b.code))

  const prevClicks = prevRows[0]?.count ?? 0
  const all = allTimeRows[0]

  return {
    item: {
      id: item.id,
      ...identity(item.type, item.state, item.data),
      link: str(item.data.link),
    },
    range: rangeOutput(r),
    site: site ?? null,
    totals,
    previous: r.compare
      ? { from: r.prevFrom, to: r.prevTo, clicks: prevClicks, clicksChangePct: changePct(totals.clicks, prevClicks) }
      : null,
    allTime: {
      clicks: all.clicks,
      websiteClicks: all.website,
      shortLinkClicks: all.clicks - all.website,
      firstClickAt: all.first,
    },
    bySite,
    bySource: [{ source: 'website', clicks: totals.websiteClicks }, ...shortLinkSources],
    series: [...seriesMap.values()],
  }
}

// ── get_top_items ───────────────────────────────────────────────

export async function getTopItems(
  input: RangeInput & { site?: string; type?: string; limit?: number | string },
): Promise<TopItems> {
  const r = resolveRange(input)
  const site = input.site || undefined
  const type = input.type || undefined
  if (type && !CONTENT_TYPES.includes(type)) {
    throw new ValidationError(`type must be one of ${CONTENT_TYPES.join(', ')}`)
  }
  const limit = parseLimit(input.limit, TOP_ITEMS_DEFAULT, TOP_ITEMS_MAX)
  await assertSite(site)

  const [totalRows, rows] = await Promise.all([
    sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM analytics_events ae
      WHERE ae.event_type = 'link_click' AND ${inRange(r)} ${siteFilter(site)}
    `,
    sql<{ item_id: string; clicks: number; website: number; type: string; state: string; data: Record<string, unknown> }[]>`
      WITH c AS (
        SELECT ae.item_id,
               COUNT(*)::int AS clicks,
               (COUNT(*) FILTER (WHERE ae.short_link_id IS NULL))::int AS website
        FROM analytics_events ae
        WHERE ae.event_type = 'link_click' AND ae.item_id IS NOT NULL
          AND ${inRange(r)} ${siteFilter(site)}
        GROUP BY ae.item_id
      )
      SELECT c.item_id, c.clicks, c.website, ci.type, ci.state, ci.data
      FROM c
      JOIN content_items ci ON ci.id = c.item_id
      WHERE ci.state <> 'deleted' ${type ? sql`AND ci.type = ${type}` : sql``}
      ORDER BY c.clicks DESC, ci.data->>'title' ASC NULLS LAST, c.item_id ASC
      LIMIT ${limit}
    `,
  ])

  const totalClicks = totalRows[0]?.count ?? 0
  return {
    range: rangeOutput(r),
    site: site ?? null,
    totalClicks,
    items: rows.map(row => ({
      itemId: row.item_id,
      ...identity(row.type, row.state, row.data),
      clicks: row.clicks,
      websiteClicks: row.website,
      shortLinkClicks: row.clicks - row.website,
      sharePct: totalClicks > 0 ? Math.round((row.clicks / totalClicks) * 1000) / 10 : 0,
    })),
  }
}

// ── get_short_link_stats ────────────────────────────────────────

export async function getShortLinkStats(
  input: RangeInput & { code?: string; itemId?: string },
): Promise<ShortLinkStats> {
  const code = input.code || undefined
  const itemId = input.itemId || undefined
  if (code && itemId) throw new ValidationError('pass either code or itemId, not both')
  const r = resolveRange(input)
  if (itemId) await findActiveItem(itemId)

  const rows = await sql<{
    id: string; code: string; label: string; content_item_id: string; site_slug: string | null
    created_at: string; item_title: string | null; clicks: number; all_time: number
  }[]>`
    SELECT sl.id, sl.code, sl.label, sl.content_item_id, sl.site_slug,
           to_char(sl.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
           ci.data->>'title' AS item_title,
           (SELECT COUNT(*)::int FROM analytics_events ae WHERE ae.short_link_id = sl.id AND ${inRange(r)}) AS clicks,
           (SELECT COUNT(*)::int FROM analytics_events ae WHERE ae.short_link_id = sl.id) AS all_time
    FROM short_links sl
    JOIN content_items ci ON ci.id = sl.content_item_id
    WHERE TRUE
      ${code ? sql`AND sl.code = ${code}` : sql``}
      ${itemId ? sql`AND sl.content_item_id = ${itemId}` : sql``}
    ORDER BY clicks DESC, all_time DESC, sl.created_at DESC, sl.id
    LIMIT ${SHORT_LINK_STATS_MAX}
  `
  if (code && rows.length === 0) throw new NotFoundError(`short link "${code}" not found`)

  const shortLinks: ShortLinkStats['shortLinks'] = rows.map(row => ({
    id: row.id,
    code: row.code,
    label: row.label,
    url: shortLinkUrl(row.code),
    contentItemId: row.content_item_id,
    itemTitle: row.item_title,
    siteSlug: row.site_slug,
    createdAt: row.created_at,
    clicks: row.clicks,
    allTimeClicks: row.all_time,
  }))

  if (code) {
    const seriesRows = await sql<{ bucket: string; count: number }[]>`
      SELECT ${bucket(r)} AS bucket, COUNT(*)::int AS count
      FROM analytics_events ae
      WHERE ae.short_link_id = ${rows[0].id} AND ${inRange(r)}
      GROUP BY 1
    `
    const series = new Map(bucketLabels(r.from, r.to, r.granularity).map(b => [b, { bucket: b, clicks: 0 }]))
    for (const row of seriesRows) {
      const entry = series.get(row.bucket)
      if (entry) entry.clicks += row.count
    }
    shortLinks[0].series = [...series.values()]
  }

  return { range: rangeOutput(r), shortLinks }
}
