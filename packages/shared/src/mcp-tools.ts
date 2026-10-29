// The MCP tool contract (spec 05, FR-084, ADR-024): names, descriptions, zod input
// schemas and annotations of every tool, declared once and registered from here by
// both servers — the stdio server (`packages/mcp`, calls the REST API) and the remote
// endpoint (`packages/api/src/routes/mcp.ts`, calls services). No handlers here.
//
// Exported from the `@betel/shared/mcp-tools` entry (not the root) so `packages/app`
// keeps importing only types from `@betel/shared`.

import { z } from 'zod'
import { CHURCH_TIME_ZONE, isClockTime } from './event-time.js'

/** The default analytics zone, documented to agents. Equals CHURCH_TIME_ZONE (ADR-017). */
export const DEFAULT_TIME_ZONE = CHURCH_TIME_ZONE
export const MAX_RANGE_DAYS = 366
export const DEFAULT_RANGE_DAYS = 30

// ── Field schemas ───────────────────────────────────────────────

// Media library URLs are relative (/uploads/<uuid>.webp); external absolute URLs are also accepted.
const thumbnailSchema = z.string().refine(
  v => v.startsWith('/uploads/') || URL.canParse(v),
  'must be a media library path (/uploads/...) or an absolute URL',
)

// Event dates are calendar days in Romania (YYYY-MM-DD); impossible dates such as
// 2026-02-30 are rejected (same rule as isCalendarDay in packages/api/src/services/time.ts).
function isCalendarDayString(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === v
}
const calendarDaySchema = z.string().refine(isCalendarDayString, 'must be a calendar date in YYYY-MM-DD format')

/** Event start time (spec 04 §6.2, BR-035): a 24-hour "HH:mm" clock time. */
export const clockTimeSchema = z.string().refine(isClockTime, 'must be a 24-hour clock time in HH:mm format')

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')

export const dateRangeShape = {
  from: isoDate.optional().describe('Start date (inclusive), YYYY-MM-DD, calendar day in "tz". Default: 29 days before "to".'),
  to: isoDate.optional().describe(`End date (inclusive), YYYY-MM-DD in "tz". Default: today. Must be >= from and <= today. Max span ${MAX_RANGE_DAYS} days.`),
  tz: z.string().min(1).optional().describe(`IANA time zone that defines the calendar days, e.g. ${DEFAULT_TIME_ZONE} (the default, church local time). Numeric offsets such as +02:00 are rejected. Same parameter as the admin analytics endpoints.`),
}
export const granularity = z.enum(['day', 'week', 'month'])
  .optional().describe('Bucket size of the time series. Default: day for ranges up to 92 days, week otherwise. Weeks start on Monday; buckets are labelled with their first day (the first bucket is clamped to "from").')
export const compare = z.boolean().optional()
  .describe('Include the previous period of equal length ending the day before "from" (default true).')
export const siteSlug = z.string().min(1).optional()
  .describe('Restrict to one church site (slug from list_sites). Omit for all sites.')

const readOnly = { readOnlyHint: true } as const
const write = { readOnlyHint: false } as const

// ── The contract ────────────────────────────────────────────────

export const toolContract = {
  list_sites: {
    description: 'List all church sites (slugs, names, accent colours). Use slugs when scoping cards to specific sites.',
    input: {},
    annotations: readOnly,
  },
  list_groups: {
    description: 'List all content groups. Use group IDs when attaching a card to a group.',
    input: {},
    annotations: readOnly,
  },
  list_media: {
    description: 'List images in the media library. Use the returned URLs as thumbnail values when creating cards.',
    input: {},
    annotations: readOnly,
  },
  upload_media: {
    description: 'Upload an image (max 5 MB decoded) to the media library from base64-encoded data. Returns the uploaded image ID and its relative URL (e.g. /uploads/<id>.webp). Pass that URL as-is as the thumbnail when creating or updating cards.',
    input: {
      imageData: z.string().describe('Base64-encoded image data (raw bytes, without a data: URI prefix)'),
      filename: z.string().optional().describe('Original filename e.g. "photo.jpg" — used for reference only'),
      mimeType: z.string().optional().describe('MIME type of the image e.g. "image/jpeg" or "image/png". Defaults to "image/jpeg"; only image/* types are accepted. The image is converted to WebP either way.'),
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
  list_cards: {
    description: 'List all card content items (including drafts and archived). Returns id, state, data, and site scoping.',
    input: {},
    annotations: readOnly,
  },
  create_card: {
    description: 'Create a new card content item (starts as draft). Returns the created item with its ID.',
    input: {
      title: z.string().describe('Card title (required)'),
      description: z.string().optional().describe('Card body text — supports Markdown'),
      thumbnail: thumbnailSchema.optional().describe('Image URL from the media library (as returned by upload_media / list_media, e.g. /uploads/<id>.webp)'),
      startDate: calendarDaySchema.optional().describe('Visibility start date, YYYY-MM-DD (Romania calendar day), e.g. 2024-06-01'),
      endDate: calendarDaySchema.optional().describe('Visibility end date, YYYY-MM-DD; the card stays visible until the end of this day in Romania'),
      startTime: clockTimeSchema.optional().describe('Start time HH:mm (24-hour, Romania local time). Only for single-day events: requires startDate and no endDate (or endDate equal to startDate).'),
      link: z.string().url().optional().describe('Primary action URL opened when the card is tapped'),
      cta: z.string().optional().describe('Call-to-action button label, e.g. "Read more"'),
      sites: z.array(z.string()).optional().describe('Site slugs to show this card on; omit or pass [] for all sites'),
      exclusiveSite: z.string().optional().describe('Restrict card to exactly one site (mutually exclusive with sites[])'),
      groupId: z.string().uuid().optional().describe('ID of the group to attach this card to'),
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
  update_card: {
    description: 'Update fields on an existing card. Only the provided fields are changed.',
    input: {
      id: z.string().uuid().describe('Card ID to update'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description (Markdown)'),
      thumbnail: thumbnailSchema.optional().describe('New thumbnail URL (media library path /uploads/... or absolute URL)'),
      startDate: calendarDaySchema.optional().describe('New start date, YYYY-MM-DD'),
      endDate: calendarDaySchema.optional().describe('New end date, YYYY-MM-DD'),
      startTime: clockTimeSchema.nullable().optional().describe('New start time HH:mm (Romania local time), or null to clear. Only for single-day events.'),
      link: z.string().url().optional().describe('New action URL'),
      cta: z.string().optional().describe('New CTA label'),
      sites: z.array(z.string()).optional().describe('New site slugs array'),
      exclusiveSite: z.string().optional().describe('New exclusive site slug; pass empty string to clear'),
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
  publish_card: {
    description: 'Publish a card (transition from draft → published so it appears on the public site).',
    input: {
      id: z.string().uuid().describe('Card ID to publish'),
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
  },

  get_analytics_overview: {
    description: 'Hub-wide analytics for a date range: views (site visits) and link clicks, a count per event type, per-site breakdown, time series and comparison with the previous period. Dates are calendar days in "tz" (default Europe/Bucharest). Percentage changes are null when the previous period has no events of that kind.',
    input: { ...dateRangeShape, site: siteSlug, granularity, compare },
    annotations: readOnly,
  },
  get_item_stats: {
    description: 'Click statistics for one content item (e.g. an event card) over a date range: total clicks split by website vs short link, per short link, per site, time series, previous-period comparison and all-time totals, plus the item\'s startDate, startTime and location as stored (null when unset). Note: per-item views are not tracked, only clicks; clicks of a deleted short link count as website clicks.',
    input: {
      itemId: z.string().uuid().describe('Content item id (from list_cards or get_top_items)'),
      ...dateRangeShape, site: siteSlug, granularity, compare,
    },
    annotations: readOnly,
  },
  get_top_items: {
    description: 'Content items ranked by link clicks in a date range, with website/short-link split and share of all clicks. Items with zero clicks in the range are not listed.',
    input: {
      ...dateRangeShape,
      site: siteSlug,
      type: z.enum(['card', 'poster', 'richtext', 'video']).optional().describe('Only items of this type'),
      limit: z.number().int().min(1).max(50).optional().describe('Default 10'),
    },
    annotations: readOnly,
  },
  get_short_link_stats: {
    description: 'Clicks per short link in a date range plus all-time clicks. Select one link by code, all links of an item by itemId, or omit both for every short link (max 50, ranked by clicks). A daily/weekly series is included only when a single code is given.',
    input: {
      code: z.string().min(1).optional().describe('Short link code (the part after /s/)'),
      itemId: z.string().uuid().optional().describe('Content item id: every short link of that item'),
      ...dateRangeShape,
      granularity,
    },
    annotations: readOnly,
  },
  create_short_link: {
    description: 'Create a tracked short link (https://<host>/s/<code>) for a content item and a distribution channel label such as "WhatsApp Mănăștur" or "QR flyer". The destination is resolved at redirect time from the item\'s link (per-site override when siteSlug is set). Returns the full public URL.',
    input: {
      itemId: z.string().uuid().describe('Content item the link points to'),
      label: z.string().trim().min(1).max(100).describe('Channel label shown in analytics'),
      siteSlug: z.string().min(1).optional().describe('Use this site\'s link override (data.siteLinks[siteSlug]) and attribute clicks to this site'),
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
  list_short_links: {
    description: 'List short links with their public URL and all-time click count. Filter by itemId and/or site.',
    input: {
      itemId: z.string().uuid().optional().describe('Only links of this content item'),
      site: siteSlug,
      limit: z.number().int().min(1).max(500).optional().describe('Default 100, newest first'),
    },
    annotations: readOnly,
  },
} as const satisfies Record<string, {
  description: string
  input: z.ZodRawShape
  annotations: { readOnlyHint: boolean; idempotentHint?: boolean }
}>

export type ToolName = keyof typeof toolContract

/** Every tool name, in contract order. */
export const toolNames = Object.keys(toolContract) as ToolName[]

/** The parsed arguments a handler of tool `N` receives. */
export type ToolArgs<N extends ToolName> = z.infer<z.ZodObject<(typeof toolContract)[N]['input']>>

/** What every handler returns: one JSON (or plain) text block. */
export interface ToolResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/** A complete handler table; a missing tool is a type error (ADR-024 rule 1). */
export type ToolHandlers = { [N in ToolName]: (args: ToolArgs<N>) => Promise<ToolResult> }
