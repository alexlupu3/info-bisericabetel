export interface Site {
  slug: string
  name: string
  accent: string
  /** Free-text address label (display line and `PostalAddress.streetAddress` fallback). */
  address?: string | null
  // Structured address (migration 0013_site_address_fields), used by the site's
  // schema.org `Church` markup (spec 03). All optional.
  streetAddress?: string | null
  postalCode?: string | null
  addressLocality?: string | null
  addressRegion?: string | null
  /** ISO 3166-1 alpha-2; `SEO_DEFAULT_COUNTRY` applies when absent. */
  addressCountry?: string | null
  latitude?: number | null
  longitude?: number | null
  telephone?: string | null
  email?: string | null
}

export type ContentType = 'card' | 'richtext' | 'poster' | 'video'
export type PublishState = 'draft' | 'published' | 'archived' | 'deleted'

export interface ContentItem {
  id: string
  type: ContentType
  state: PublishState
  sites: string[] | null  // null = all sites
  order: number
  groupId: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}

export interface ApiHealth {
  status: 'ok'
  version: string
  timestamp: string
}

export interface Language {
  code: string
  name: string
  isDefault: boolean
  enabled: boolean
}

export interface UiTranslation {
  locale: string
  key: string
  value: string
}

export interface ContentTranslation {
  id: string
  contentItemId: string
  locale: string
  data: Record<string, unknown>
}

export interface GroupTranslation {
  id: string
  groupId: string
  locale: string
  title: string
}

export interface ShortLink {
  id: string
  code: string
  label: string
  contentItemId: string
  siteSlug: string | null
  createdAt: string
  clickCount: number
}

/** A short link with its absolute public URL (`PUBLIC_BASE_URL` + `/s/<code>`), spec 05. */
export interface ShortLinkWithUrl extends ShortLink {
  url: string
  /** `data.title` of the item the link points to (null when the item has none). */
  itemTitle: string | null
}

/** Response of short-link creation (REST `POST …/short-links` and MCP `create_short_link`). */
export interface CreatedShortLink extends ShortLinkWithUrl {
  /** BR-012 resolution at creation time (`data.siteLinks[siteSlug] ?? data.link`); informational. */
  destination: string | null
  /** Present when the item has no link: the short link redirects to `/` until one is set. */
  warning?: string
}

// ── Range analytics (spec 05, BR-040) ─────────────────────────────

export type AnalyticsGranularity = 'day' | 'week' | 'month'

export interface AnalyticsRange {
  from: string            // YYYY-MM-DD, inclusive
  to: string              // YYYY-MM-DD, inclusive
  days: number
  timeZone: string        // the effective IANA zone
  granularity: AnalyticsGranularity
}

export interface OverviewStats {
  range: AnalyticsRange
  site: string | null
  totals: { views: number; clicks: number; byEventType: Record<string, number> }
  /** null when compare=false; each *ChangePct is null when its own previous value is 0. */
  previous: {
    from: string
    to: string
    views: number
    clicks: number
    viewsChangePct: number | null
    clicksChangePct: number | null
  } | null
  bySite: { site: string | null; name: string | null; views: number; clicks: number }[]
  series: { bucket: string; views: number; clicks: number }[]
}

/** Identity of an item in analytics output; event fields as stored, null when absent. */
export interface AnalyticsItemIdentity {
  type: string
  title: string | null
  state: string
  startDate: string | null
  startTime: string | null
  location: string | null
}

export interface ItemStats {
  item: AnalyticsItemIdentity & { id: string; link: string | null }
  range: AnalyticsRange
  site: string | null
  totals: { clicks: number; websiteClicks: number; shortLinkClicks: number }
  previous: { from: string; to: string; clicks: number; clicksChangePct: number | null } | null
  allTime: { clicks: number; websiteClicks: number; shortLinkClicks: number; firstClickAt: string | null }
  bySite: { site: string | null; clicks: number }[]
  bySource: (
    | { source: 'website'; clicks: number }
    | { source: 'short_link'; shortLinkId: string; code: string; label: string; siteSlug: string | null; url: string; clicks: number }
  )[]
  series: { bucket: string; clicks: number; websiteClicks: number; shortLinkClicks: number }[]
}

export interface TopItems {
  range: AnalyticsRange
  site: string | null
  totalClicks: number
  items: (AnalyticsItemIdentity & {
    itemId: string
    clicks: number
    websiteClicks: number
    shortLinkClicks: number
    sharePct: number
  })[]
}

export interface ShortLinkStats {
  range: AnalyticsRange
  shortLinks: {
    id: string
    code: string
    label: string
    url: string
    contentItemId: string
    itemTitle: string | null
    siteSlug: string | null
    createdAt: string
    clicks: number
    allTimeClicks: number
    /** Only when a single `code` was requested. */
    series?: { bucket: string; clicks: number }[]
  }[]
}

export interface SqlQueryRequest {
  query: string
  readOnly: boolean
}

export interface SqlQueryColumn {
  name: string
  typeOid: number
}

export interface SqlQueryResult {
  command: string
  columns: SqlQueryColumn[]
  rows: Record<string, unknown>[]
  /** Rows affected or returned; when `truncated`, only the number shown (more exist) */
  rowCount: number
  truncated: boolean
  durationMs: number
}

/**
 * `invalid`  — malformed input caught before reaching the database
 * `blocked`  — rejected by the dangerous-command filter
 * `database` — PostgreSQL refused the statement (syntax, missing table, ...)
 * `read_only`— a write was attempted in read-only mode
 * `timeout`  — the statement exceeded the time limit
 * `unavailable` — the console's database role is not set up
 */
export type SqlQueryErrorKind = 'invalid' | 'blocked' | 'database' | 'read_only' | 'timeout' | 'unavailable'

export interface SqlQueryError {
  error: string
  kind: SqlQueryErrorKind
  /** 1-based character offset into the query, when known */
  position?: number
  line?: number
  column?: number
  hint?: string
  detail?: string
  pgCode?: string
}

export * from './event-time.js'
export * from './event-location.js'
export * from './i18n-defaults.js'
export * from './seo.js'
