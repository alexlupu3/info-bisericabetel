# 05 — MCP tools for analytics and short-link creation

- **Owner area:** MCP (stdio `packages/mcp` + remote `/mcp` in `packages/api`)
- **FR range:** FR-080 – FR-084
- **ADR:** [ADR-024](../../decisions/ADR-024-mcp-shared-tool-contract-and-service-layer.md) (Proposed)
- **Migration:** none
- **Status:** spec, not implemented

## 1. Summary

An AI agent connected to either MCP surface can today create and publish cards but cannot answer "how did the youth camp announcement perform?" or "give me a WhatsApp link for this event". This spec adds six tools — four read-only analytics tools (`get_analytics_overview`, `get_item_stats`, `get_top_items`, `get_short_link_stats`) and two short-link tools (`create_short_link`, `list_short_links`) — to **both** MCP surfaces with identical names, input schemas and output shapes.

To stop the two surfaces drifting further apart (ADR-015 records that every tool is implemented twice), the tool *contract* (names, descriptions, zod input schemas) moves to one shared module, and the *business logic* (analytics queries, short-link creation with validation and audit) moves to service functions in `packages/api/src/services/`. The REST handlers and the remote MCP tools call those services directly; the stdio server keeps calling REST (ADR-012) and therefore runs the same code one hop away.

All analytics date ranges in the new tools are calendar days in **Europe/Bucharest**.

## 2. Goals / Non-goals

**Goals**

- An agent can get, for any content item (typically an event card), clicks over a date range, split by source (website vs each short link), by site, and as a time series, with a previous-period comparison.
- An agent can get hub-wide views/clicks for a date range, per-site breakdown and period comparison, and a ranked list of top items.
- An agent can get click statistics per short link (by code or per item).
- An agent can create a short link for an item (label, optional site override) and receive the full public URL, and list existing short links.
- The six tools behave identically on stdio and remote; the implementation makes drift structurally hard, not just discouraged.
- Short-link creation becomes audit-logged on every path (closes part of the FR-023 gap).

**Non-goals**

- Deleting short links through MCP (see §11, Q1 — deliberately excluded in v1).
- Custom (vanity) short-link codes (Q2).
- Per-item *views* / impressions. Only `site_visit` (site-level) and `link_click` (item-level) events exist; this spec does not add an `item_view` event type (Q3).
- Changing the admin analytics dashboard (it stays UTC-bucketed; Q4), the admin short-link UI (owned by 06), or the short-link preview fields (06).
- Replacing `MCP_SECRET` / `BETEL_EMAIL` auth with the API key layer (roadmap, pending).
- Exposing analytics for Poster/richtext/video *creation*; read tools are type-agnostic, write tools stay cards-only.

## 3. Current state

| Concern | Today | File |
|---|---|---|
| Stdio MCP | 8 tools, thin REST client with JWT login/re-login; each tool re-declares its zod schema inline | `packages/mcp/src/index.ts` |
| Remote MCP | Same 8 tool names, re-implemented against Drizzle; `MCP_SECRET` bearer compared with `!==`; no rate limit; 8 MiB body limit; audit actor `mcp@betel` | `packages/api/src/routes/mcp.ts` |
| Shared code between the two | None. Descriptions and schemas are copy-pasted; `upload_media` already differs (`mimeType` only on stdio). `resortGroupChronologically` in `services/group-order.ts` is the only shared piece of business logic (ADR-015 update 2026-10-17) | — |
| Admin analytics REST | `overview`, `sites-comparison`, `items`, `items/:id/daily`, `items/:id/export`, legacy `lifetime`, `daily`. Presets only (`day`/`week`/`month`) or `startDate`→today; buckets are **UTC** days (`occurred_at AT TIME ZONE 'UTC'`); per-item daily is fixed to last 90 days; admin or super-admin | `packages/api/src/routes/admin/analytics.ts` |
| Analytics events | `analytics_events(event_type, site_slug, item_id, url, short_link_id, occurred_at)`; `site_visit` has no `item_id`; website clicks have `short_link_id IS NULL`; indexes on `(event_type, occurred_at)`, `(site_slug, occurred_at)`, partial `(item_id, occurred_at)`, `(short_link_id)` | `packages/api/src/db/schema.ts`, migrations `0004`, `0006`, `0010` |
| Short links REST | `GET/POST /api/admin/content/:id/short-links`, `DELETE .../:shortLinkId`; 6-char `[a-z0-9]` code via `crypto.randomInt`, up to 10 collision retries (select-then-insert, not race-safe); label required; `siteSlug` not validated (FK error → 500); **no audit entry**; response has no absolute URL (admin UI builds it from `window.location.origin`) | `packages/api/src/routes/short-links.ts`, `packages/app/src/admin/components/content/ShortLinksTab.tsx` |
| Redirect `/s/:code` | Resolves `data.siteLinks[siteSlug] ?? data.link` at redirect time (BR-012), logs `link_click` with `short_link_id`, 10-min IP dedup | same file (owned by **06** from here on) |
| Authorization | REST analytics and short links: `admin` or `super-admin`. Remote MCP: anyone holding `MCP_SECRET`. Stdio MCP: the configured account's role | `security.md` |
| Audit | `logAudit({ userEmail, action, entityType, entityId, detail })`; failures swallowed | `packages/api/src/db/audit.ts` |
| Public base URL | Not available yet; `PUBLIC_BASE_URL` + `absoluteUrl(path)` are introduced by **03-seo.md** (`packages/api/src/services/public-url.ts`) | — |

## 4. User flows

**AI agent (stdio — Claude Desktop / Cursor; remote — Claude iOS app)**

Flow A — "How is the Tabăra de tineret announcement doing?"
1. Agent calls `list_cards` (existing) or `get_top_items` to find the item id by title.
2. Agent calls `get_item_stats({ itemId })` → last 30 days, Bucharest days, clicks by source/site/day, previous 30 days for comparison, all-time totals.
3. Agent summarises: "87 clicks in the last 30 days (+74 % vs the previous 30), 27 of them from the WhatsApp short link; peak on 2026-10-12."

Flow B — "Compare the sites this month vs last month"
1. `get_analytics_overview({ from: '2026-10-01', to: '2026-10-28' })` → totals, `bySite`, `previous`, daily series.

Flow C — "Make a short link for this event to put on the printed flyer"
1. `create_short_link({ itemId, label: 'Flyer intrare', siteSlug? })`.
2. Tool returns `url` (`https://<PUBLIC_BASE_URL>/s/<code>`) and `destination` (what the link currently resolves to) plus a `warning` when the item has no link.
3. Later: `get_short_link_stats({ code })` for that channel alone.

**Admin** — no UI change. Short links created by agents appear in the content editor's "Link-uri scurte" tab like any other; `/admin/logs` shows a `short-link.create` entry attributed to the service account (stdio) or `mcp@betel` (remote).

**Public visitor** — unchanged; `/s/:code` behaviour is owned by 06.

## 5. Requirements

- **FR-080 — MCP analytics overview.** Both MCP surfaces expose `get_analytics_overview` returning, for a Europe/Bucharest date range (default last 30 days, max 366 days): totals of views (`site_visit`) and clicks (`link_click`), a generic `byEventType` map (so event types added by other specs appear without MCP changes), a per-site breakdown, a time series at day/week/month granularity, and an equal-length previous-period comparison with percentage change. Optional `site` filter. Testable: same input on stdio and remote returns byte-identical JSON (modulo key order) for the same database.
- **FR-081 — MCP per-item statistics.** Both surfaces expose `get_item_stats(itemId, …)` returning the item's identity (id, type, title, state, `startDate`), clicks in range split into website vs short-link, per short link (code, label, URL), per site, a time series, previous-period comparison, and all-time totals. Unknown or soft-deleted item → tool error, not an empty result. Testable with seeded events.
- **FR-082 — MCP ranking and short-link statistics.** Both surfaces expose `get_top_items` (items ranked by clicks in range, `limit` 1–50, optional `site`/`type` filters, share of total) and `get_short_link_stats` (clicks in range and all-time per short link, selected by `code`, by `itemId`, or all; a time series only when a single `code` is given).
- **FR-083 — MCP short-link creation and listing.** Both surfaces expose `create_short_link(itemId, label, siteSlug?)` and `list_short_links(itemId?, site?)`. Creation validates the item (exists, not `deleted`), the label (1–100 chars after trim) and the site slug (must exist), generates a unique 6-character code, writes an audit entry `short-link.create`, and returns the absolute public URL built with `absoluteUrl('/s/<code>')` (03). The REST endpoint `POST /api/admin/content/:id/short-links` gains the same validation, audit entry and `url` field, because both paths call one service. Listing returns `url` and all-time `clickCount` per link.
- **FR-084 — MCP parity and hardening.** Tool names, descriptions and zod input schemas for *all* tools (existing 8 + new 6) are declared once in `@betel/shared` (`packages/shared/src/mcp-tools.ts`) and registered from that module by both servers; `pnpm --filter @betel/mcp parity` connects to both surfaces, diffs `tools/list` and fails on any difference. The remote endpoint compares `MCP_SECRET` in constant time and rate-limits `POST /mcp` (120 requests / minute / IP). Read-only tools carry MCP `readOnlyHint` annotations.

## 6. Design

### 6.1 Architecture: one contract, one service layer, two transports

```
packages/shared/src/mcp-tools.ts        ← names, descriptions, zod input schemas, annotations (FR-084)
        │                                   (imported by both servers; no handlers here)
        ├── packages/mcp/src/index.ts     ← stdio: handler = REST call, returns JSON as-is
        └── packages/api/src/routes/mcp.ts← remote: handler = service call

packages/api/src/services/analytics-stats.ts   ← range parsing, Bucharest bucketing, 4 query functions
packages/api/src/services/short-links.ts       ← createShortLink / listShortLinks / deleteShortLink (+audit)
        ▲                              ▲
        │                              │
packages/api/src/routes/admin/analytics.ts (new endpoints)   packages/api/src/routes/short-links.ts (admin handlers → services)
```

Rules that follow (recorded in ADR-024):

1. A tool exists on both surfaces or on neither. Registering happens by iterating the shared contract, so forgetting one side is a type error, not a runtime surprise.
2. Business logic never lives in `routes/mcp.ts` or in `packages/mcp`; both are adapters. New rules go into `services/` and are used by the REST handler too.
3. The stdio server returns the REST JSON body untouched, so REST response shape == tool output shape. The remote tool returns the service result untouched, and the REST handler returns the same service result, so the three agree by construction.

**Why not have the remote endpoint call REST via `app.inject`?** It would need a synthetic admin JWT and keeps two code paths for errors. The service-layer approach is the one ADR-015 lists as follow-up (a) and already has a precedent (`group-order.ts`).

**Build consequence.** `@betel/shared` is consumed as raw TypeScript (`main: ./src/index.ts`). `packages/api` bundles with esbuild so that works; `packages/mcp` compiles with `tsc` and runs `node dist/index.js`, which cannot load `.ts` from `node_modules`. The mcp package therefore switches to the same esbuild bundling as the API (`esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js`, keep the shebang via `--banner:js='#!/usr/bin/env node'`). `@betel/shared` gains its first runtime dependency, `zod ^3.23.8` (same range as api and mcp). The contract is exported from a separate entry `@betel/shared/mcp-tools` (add `"./mcp-tools": "./src/mcp-tools.ts"` to `exports`) so `packages/app` keeps importing only types from the root entry.

### 6.2 Shared tool contract (`packages/shared/src/mcp-tools.ts`)

```ts
import { z } from 'zod'

export const TIME_ZONE = 'Europe/Bucharest'
export const MAX_RANGE_DAYS = 366
export const DEFAULT_RANGE_DAYS = 30

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')

export const dateRangeShape = {
  from: isoDate.optional().describe(`Start date (inclusive), YYYY-MM-DD, calendar day in ${TIME_ZONE}. Default: 29 days before "to".`),
  to:   isoDate.optional().describe(`End date (inclusive), YYYY-MM-DD in ${TIME_ZONE}. Default: today. Must be >= from and <= today. Max span ${MAX_RANGE_DAYS} days.`),
}
export const granularity = z.enum(['day', 'week', 'month'])
  .optional().describe('Bucket size of the time series. Default: day for ranges up to 92 days, week otherwise. Weeks start on Monday; buckets are labelled with their first day.')
export const compare = z.boolean().optional()
  .describe('Include the previous period of equal length ending the day before "from" (default true).')
export const siteSlug = z.string().min(1).optional()
  .describe('Restrict to one church site (slug from list_sites). Omit for all sites.')

export const toolContract = {
  // existing 8 tools move here unchanged (schemas copied from routes/mcp.ts, which is the
  // stricter of the two today; stdio-only `mimeType` on upload_media is kept as optional on both)
  list_sites:   { description: '…', input: {}, annotations: { readOnlyHint: true } },
  // … list_groups, list_media, list_cards, create_card, update_card, publish_card, upload_media

  get_analytics_overview: {
    description: 'Hub-wide analytics for a date range: views (site visits) and link clicks, per-site breakdown, time series and comparison with the previous period. Dates are calendar days in Europe/Bucharest.',
    input: { ...dateRangeShape, site: siteSlug, granularity, compare },
    annotations: { readOnlyHint: true },
  },
  get_item_stats: {
    description: 'Click statistics for one content item (e.g. an event card) over a date range: total clicks split by website vs short link, per short link, per site, time series, previous-period comparison and all-time totals. Note: per-item views are not tracked, only clicks.',
    input: { itemId: z.string().uuid().describe('Content item id (from list_cards or get_top_items)'), ...dateRangeShape, site: siteSlug, granularity, compare },
    annotations: { readOnlyHint: true },
  },
  get_top_items: {
    description: 'Content items ranked by link clicks in a date range, with website/short-link split and share of all clicks. Items with zero clicks in the range are not listed.',
    input: { ...dateRangeShape, site: siteSlug,
      type: z.enum(['card', 'poster', 'richtext', 'video']).optional().describe('Only items of this type'),
      limit: z.number().int().min(1).max(50).optional().describe('Default 10') },
    annotations: { readOnlyHint: true },
  },
  get_short_link_stats: {
    description: 'Clicks per short link in a date range plus all-time clicks. Select one link by code, all links of an item by itemId, or omit both for every short link (max 50, ranked by clicks). A daily/weekly series is included only when a single code is given.',
    input: { code: z.string().min(1).optional(), itemId: z.string().uuid().optional(), ...dateRangeShape, granularity },
    annotations: { readOnlyHint: true },
  },
  create_short_link: {
    description: 'Create a tracked short link (https://<host>/s/<code>) for a content item and a distribution channel label such as "WhatsApp Mănăștur" or "QR flyer". The destination is resolved at redirect time from the item\'s link (per-site override when siteSlug is set). Returns the full public URL.',
    input: {
      itemId:   z.string().uuid().describe('Content item the link points to'),
      label:    z.string().trim().min(1).max(100).describe('Channel label shown in analytics'),
      siteSlug: z.string().min(1).optional().describe('Use this site\'s link override (data.siteLinks[siteSlug]) and attribute clicks to this site'),
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
  list_short_links: {
    description: 'List short links with their public URL and all-time click count. Filter by itemId and/or site.',
    input: { itemId: z.string().uuid().optional(), site: siteSlug,
      limit: z.number().int().min(1).max(500).optional().describe('Default 100, newest first') },
    annotations: { readOnlyHint: true },
  },
} as const

export type ToolName = keyof typeof toolContract
```

Each server does `for (const [name, t] of Object.entries(toolContract)) server.tool(name, t.description, t.input, handlers[name])` where `handlers: Record<ToolName, Handler>` is a fully typed record — a missing handler fails `pnpm lint`. (If the installed `@modelcontextprotocol/sdk` 1.12 `server.tool` overload does not accept annotations, use `server.registerTool`; verify at implementation time and pin the SDK minor in both packages to the same version.)

**06 delta (owned by 06-short-link-previews.md):** when 06 adds preview fields to `short_links`, it adds them as optional inputs to `create_short_link` in this contract and to `createShortLink()` in the service; this spec documents today's three fields only.

**04 delta (owned by 04-event-hours.md):** `startTime` on `create_card` / `update_card` is added by 04 in this same contract module (one place now instead of two).

### 6.3 Date-range semantics (`services/analytics-stats.ts`)

- `today` = current date in `Europe/Bucharest` (`new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date())` → `YYYY-MM-DD`).
- Defaults: `to = today`, `from = to − 29 days` (30 calendar days inclusive). `compare = true`.
- Validation (tool error / HTTP 400, exact messages in §6.8): calendar-valid dates; `from ≤ to`; `to ≤ today`; `to − from + 1 ≤ 366`.
- Previous period: `prevTo = from − 1 day`, `prevFrom = prevTo − (days − 1)`.
- Granularity default: `day` when `days ≤ 92`, else `week`. Hard cap: a series never exceeds 400 points (366 days × day = 366, fine).
- SQL: keep range predicates **sargable** on `occurred_at` so the existing indexes are used (the current admin queries wrap `occurred_at` in an expression and cannot use them):

```sql
-- bounds computed once per request from the YYYY-MM-DD strings
occurred_at >= ($from::date)::timestamp AT TIME ZONE 'Europe/Bucharest'
AND occurred_at <  ($to::date + 1)::timestamp AT TIME ZONE 'Europe/Bucharest'
-- bucket label (only in SELECT/GROUP BY, not in WHERE)
date_trunc($granularity, occurred_at AT TIME ZONE 'Europe/Bucharest')::date AS bucket
```

  DST is handled by PostgreSQL (`AT TIME ZONE` with a named zone). The container's `TZ` is irrelevant because the zone is named explicitly; do not rely on `CURRENT_DATE`.
- Week buckets: `date_trunc('week', …)` → Monday; month buckets → the 1st. The first bucket may be partial when `from` falls mid-week/mid-month; its label is **clamped to `from`** (`max(bucketStart, from)`) so every label lies inside the range and the agent never sees a bucket dated before `from`.
- `change` percentage: `round((cur − prev) / prev × 100)`; when `prev = 0` the value is `null` (the admin dashboard returns `100`/`0`; the new endpoints use `null` because it is honest and agent-friendly — Q5).
- Deleted short links: `analytics_events.short_link_id` is set to NULL on delete, so those clicks count as *website* clicks afterwards — same as the admin dashboard. The output shape stays stable; the behaviour is stated in the tool descriptions and in `entities.md` (§12).

### 6.4 Service functions (`packages/api/src/services/analytics-stats.ts`)

```ts
export type RangeInput = { from?: string; to?: string; granularity?: 'day'|'week'|'month'; compare?: boolean }
export function resolveRange(input: RangeInput, now = new Date()): ResolvedRange  // throws RangeError with the messages of §6.8

export async function getAnalyticsOverview(input: RangeInput & { site?: string }): Promise<OverviewStats>
export async function getItemStats(input: RangeInput & { itemId: string; site?: string }): Promise<ItemStats>       // throws NotFoundError
export async function getTopItems(input: RangeInput & { site?: string; type?: string; limit?: number }): Promise<TopItems>
export async function getShortLinkStats(input: RangeInput & { code?: string; itemId?: string }): Promise<ShortLinkStats> // throws NotFoundError
```

Output types live in `packages/shared/src/index.ts` (next to `ShortLink`) so the admin client can reuse them later.

**`OverviewStats`**

```jsonc
{
  "range": { "from": "2026-09-29", "to": "2026-10-28", "days": 30, "timeZone": "Europe/Bucharest", "granularity": "day" },
  "site": null,                                   // or the slug filter
  "totals": { "views": 1234, "clicks": 321, "byEventType": { "site_visit": 1234, "link_click": 321 } },
  "previous": { "from": "2026-08-30", "to": "2026-09-28", "views": 1100, "clicks": 300,
                "viewsChangePct": 12, "clicksChangePct": 7 },   // null when compare=false
  "bySite": [                                     // one row per site in `sites` + one for null
    { "site": "<site-slug>", "name": "<site name>", "views": 600, "clicks": 150 },
    { "site": null, "name": null, "views": 34, "clicks": 1 }     // events from the all-sites view
  ],
  "series": [ { "bucket": "2026-09-29", "views": 40, "clicks": 9 }, … ]   // every bucket present, zeros filled
}
```

`byEventType` is `COUNT(*) GROUP BY event_type` with no allow-list, so a `pwa_install` or `notification_open` emitted by spec 01 shows up automatically (README: "5 exposes analytics generically").

**`ItemStats`**

```jsonc
{
  "item": { "id": "…", "type": "card", "title": "…", "state": "published", "startDate": "2026-11-05", "link": "https://…" },
  "range": { … },
  "site": null,
  "totals": { "clicks": 87, "websiteClicks": 60, "shortLinkClicks": 27 },
  "previous": { "from": "…", "to": "…", "clicks": 50, "clicksChangePct": 74 },
  "allTime": { "clicks": 412, "websiteClicks": 300, "shortLinkClicks": 112, "firstClickAt": "2026-06-01T…Z" },
  "bySite": [ { "site": "<site-slug>", "clicks": 40 }, { "site": null, "clicks": 3 } ],
  "bySource": [
    { "source": "website", "clicks": 60 },
    { "source": "short_link", "shortLinkId": "…", "code": "ab12cd", "label": "WhatsApp", "siteSlug": null,
      "url": "https://<PUBLIC_BASE_URL>/s/ab12cd", "clicks": 27 }
  ],
  "series": [ { "bucket": "2026-10-01", "clicks": 3, "websiteClicks": 2, "shortLinkClicks": 1 }, … ]
}
```

`title` is `data->>'title'` (Romanian base field, as the admin dashboard). `item.link` is `data.link` (not resolved per site). Items in state `deleted` → `NotFoundError` (their events are purged on permanent delete anyway; soft-deleted items are hidden on purpose).

**`TopItems`**

```jsonc
{ "range": { … }, "site": null, "totalClicks": 321,
  "items": [ { "itemId": "…", "type": "card", "title": "…", "state": "published", "startDate": "2026-11-05",
               "clicks": 87, "websiteClicks": 60, "shortLinkClicks": 27, "sharePct": 27.1 }, … ] }
```

Ranking: clicks desc, then title asc. Items whose row no longer exists (permanently deleted) are excluded (the dashboard shows "—"; MCP output should not surface ghosts).

**`ShortLinkStats`**

```jsonc
{ "range": { … },
  "shortLinks": [ { "id": "…", "code": "ab12cd", "label": "WhatsApp", "url": "https://…/s/ab12cd",
                    "contentItemId": "…", "itemTitle": "…", "siteSlug": null, "createdAt": "…",
                    "clicks": 27, "allTimeClicks": 112,
                    "series": [ { "bucket": "2026-10-01", "clicks": 1 } ] } ] }   // series only for a single `code`
```

### 6.5 Short-link service (`packages/api/src/services/short-links.ts`)

```ts
export async function createShortLink(input: { contentItemId: string; label: string; siteSlug?: string | null },
                                      actor: { userId?: string | null; userEmail: string; via: 'admin' | 'mcp' }): Promise<ShortLinkWithUrl>
export async function listShortLinks(filter: { contentItemId?: string; siteSlug?: string; limit?: number }): Promise<ShortLinkWithUrl[]>
export async function deleteShortLink(id: string, contentItemId: string, actor): Promise<boolean>   // adds audit; REST only, no MCP tool
export function shortLinkUrl(code: string): string        // = absoluteUrl(`/s/${code}`) from 03
```

Rules in `createShortLink` (apply to REST and MCP alike):

1. `label`: trim; 1–100 characters, else `ValidationError('label is required (1–100 characters)')`.
2. Item: must exist and `state != 'deleted'`, else `NotFoundError('content item "<id>" not found')`. Draft/published/archived are all allowed (a link is often created before publishing).
3. `siteSlug`: when given, must exist in `sites`, else `ValidationError('site "<slug>" not found')` (today this is a 500 from the FK).
4. Code: 6 chars from `[a-z0-9]` using `crypto.randomInt` (unchanged alphabet, so 06's redirect and any client regex keep working). Insert inside a loop that catches PostgreSQL unique violation `23505` and retries, max 10 attempts (race-safe, replaces select-then-insert). Beyond 10 → `Error('could not generate a unique code')` (HTTP 500 / tool error).
5. `createdBy`: the REST user id; `null` for remote MCP.
6. Audit: `logAudit({ userId, userEmail, action: 'short-link.create', entityType: 'short_link', entityId: link.id, detail: { code, label, contentItemId, siteSlug, via } })`. `deleteShortLink` logs `short-link.delete` with the same detail.
7. Return `{ ...row, url: shortLinkUrl(code), clickCount: 0, destination, warning? }` where `destination` is the BR-012 resolution at creation time (`data.siteLinks[siteSlug] ?? data.link ?? null`) — informational only; `warning: 'the item has no link; the short link redirects to / until one is set'` when `destination` is null.

`listShortLinks` returns the existing `GET /api/admin/content/:id/short-links` shape plus `url` and `itemTitle`, ordered `created_at DESC`, default limit 100, max 500.

**`absoluteUrl` dependency.** `shortLinkUrl` imports `absoluteUrl` from `packages/api/src/services/public-url.ts` (03). If 05 merges before 03, task T3 creates that file with exactly the signature 03 specifies (`absoluteUrl(path: string): string`, reads `PUBLIC_BASE_URL`, strips a trailing slash) and 03 overwrites it; the fallback is settled by 03 (FR-066): production refuses to start without `PUBLIC_BASE_URL`, development defaults to `http://localhost:3100`, so `url` is always absolute.

### 6.6 REST endpoints (additive; `packages/api/src/routes/admin/analytics.ts`, `routes/short-links.ts`)

All `admin` or `super-admin`, Bearer JWT, under `/api`. Query params mirror the tool inputs 1:1 so the stdio server is a pure pass-through.

| Method & path | Service | Notes |
|---|---|---|
| `GET /admin/analytics/range?from&to&site&granularity&compare` | `getAnalyticsOverview` | new; existing `overview`/`sites-comparison` untouched |
| `GET /admin/analytics/items/:itemId/stats?from&to&site&granularity&compare` | `getItemStats` | new; existing `daily` (90-day UTC) untouched |
| `GET /admin/analytics/top-items?from&to&site&type&limit` | `getTopItems` | new; existing `items` (all-time) untouched |
| `GET /admin/analytics/short-links?from&to&code&itemId&granularity` | `getShortLinkStats` | new |
| `GET /admin/short-links?itemId&site&limit` | `listShortLinks` | new (global listing) |
| `GET /admin/content/:id/short-links` | `listShortLinks({ contentItemId })` | existing; response rows gain `url`, `itemTitle` |
| `POST /admin/content/:id/short-links` | `createShortLink` | existing; gains validation (400 for bad label/site, 404 for missing/deleted item), audit, `url`, `destination`, `warning` |
| `DELETE /admin/content/:id/short-links/:shortLinkId` | `deleteShortLink` | existing; gains audit only |

Error mapping: `ValidationError` → 400 `{ error }`, `NotFoundError` → 404 `{ error }`, `RangeError` from `resolveRange` → 400. Bodies are `{ error: string }` like the rest of the API, and the stdio server surfaces `error` verbatim as the tool error text.

### 6.7 Tool handlers

**Remote (`routes/mcp.ts`)** — each handler is 3–6 lines: parse (already done by zod), call service inside `try`, map `ValidationError`/`NotFoundError`/`RangeError` to `err(message)`, else `ok(result)`. Actor for `create_short_link`: `{ userEmail: MCP_ACTOR, via: 'mcp' }`.

**Stdio (`packages/mcp/src/index.ts`)** — each handler builds the query string from the input (`URLSearchParams`, skipping `undefined`), calls `apiFetch`, and returns `jsonResponse` data as-is; on `!ok` returns `Error: <data.error ?? JSON>`. Existing login/retry logic unchanged.

**Output format** — `content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]` as today. If the SDK version in use supports `outputSchema`/`structuredContent`, add them later; not required (Q6).

### 6.8 Error messages (identical on both surfaces)

| Condition | Message |
|---|---|
| bad date string | `from/to must be a valid calendar date in YYYY-MM-DD format` |
| `from > to` | `from must be on or before to` |
| `to > today` | `to cannot be in the future (today in Europe/Bucharest is <date>)` |
| span > 366 | `date range cannot exceed 366 days` |
| unknown site | `site "<slug>" not found` |
| unknown/deleted item | `content item "<id>" not found` |
| unknown code | `short link "<code>" not found` |
| both `code` and `itemId` | `pass either code or itemId, not both` |
| bad label | `label is required (1–100 characters)` |
| code exhaustion | `could not generate a unique short link code, try again` |
| stdio: REST unreachable / non-JSON | `Error: <status> <text>` (existing behaviour) |

### 6.9 Authorization

| Surface | Who can call the new tools | Change |
|---|---|---|
| Stdio | Whatever account `BETEL_EMAIL` is. Analytics and short links need `admin` or `super-admin`; every account has at least `admin`, so no new role gate. Service accounts should remain plain `admin`. | none |
| Remote | Anyone presenting `MCP_SECRET`; same as today for cards/media. | constant-time compare (`crypto.timingSafeEqual` on equal-length buffers), route-level rate limit `{ max: 120, timeWindow: '1 minute' }` on `POST /mcp` (the `@fastify/rate-limit` plugin is already registered with `global: false`). `GET`/`DELETE /mcp` unchanged. |

No per-tool scoping (e.g. read-only secrets) in this spec — that is the API key layer's job (roadmap). Q7 records the option of a second, read-only secret.

### 6.10 Audit

| Action | entityType | entityId | detail | Emitted by |
|---|---|---|---|---|
| `short-link.create` | `short_link` | short link id | `{ code, label, contentItemId, siteSlug, via: 'admin' \| 'mcp' }` | service (REST + remote MCP; stdio via REST with the service account's email/id) |
| `short-link.delete` | `short_link` | short link id | `{ code, label, contentItemId, via }` | service (REST only) |

Analytics reads are not audited (no reads are audited anywhere in the system). Both actions are new strings to add to the FR-023 list and `security.md`.

### 6.11 Limits and performance

- Date span ≤ 366 days; series ≤ 366 points; `limit` ≤ 50 (top items) / ≤ 500 (list short links) / 50 (short-link stats without a code).
- Each tool runs 2–5 aggregate queries bounded by the range; all use the `occurred_at` indexes (sargable bounds, §6.3). On the current data volume (tens of thousands of events) every call is well under 100 ms.
- Remote: 120 requests/min/IP; body limit stays 8 MiB (needed by `upload_media`). Analytics responses are a few KB.
- Stdio: 15 s fetch timeout (existing). Query strings are short.
- No caching: analytics must be live; the queries are cheap.

### 6.12 Configuration

No new environment variables. Consumes `PUBLIC_BASE_URL` (03). `MCP_SECRET`, `BETEL_*` unchanged. Document in `configuration.md` that `PUBLIC_BASE_URL` now also feeds short-link URLs returned by the API and MCP (snippet in §12).

### 6.13 Security and privacy

- Analytics outputs are aggregates only; no IPs or user agents are stored or exposed. The only raw-event endpoint (`items/:id/export`) is not exposed through MCP.
- `create_short_link` writes a row that affects public behaviour (`/s/<code>` starts redirecting). The label is free text (≤ 100 chars) shown only in the admin; it is stored as-is and JSON-encoded on output, no HTML rendering.
- The remote secret handling improves (constant-time compare, rate limit); the shared-secret model itself is unchanged and stays listed under Known risks.

## 7. Contracts

> **Delta from spec 07 (event location):** this spec consumes `data.location` via `readLocation()` — see the ready-to-paste amendment for this spec in [07-event-location.md](07-event-location.md) §7 "Consumer deltas". Apply it with this spec's implementation.

**Provides**

- MCP tool surface (both files) — the shared contract module `packages/shared/src/mcp-tools.ts`; other specs add fields there: **04** (`startTime` on `create_card`/`update_card`), **06** (optional preview fields on `create_short_link`).
- Generic `byEventType` in `get_analytics_overview` — new `analytics_events.event_type` values emitted by **01** appear without MCP changes.
- `createShortLink()` / `listShortLinks()` services and `url` on short-link REST responses — **06** may use `url` in the admin short-link UI instead of `window.location.origin` (optional, their call).

**Consumes**

- `absoluteUrl(path)` and `PUBLIC_BASE_URL` from **03** (`packages/api/src/services/public-url.ts`). Always absolute (03 FR-066: required in production, `http://localhost:3100` default in development).
- Short-link data model and `/s/:code` from **06** — this spec does not change the table or the redirect; it only moves the *admin* handlers in `routes/short-links.ts` onto the service. **Coordination:** both 05 and 06 edit `packages/api/src/routes/short-links.ts` (05: `adminShortLinksRoutes`; 06: `shortLinkRedirectRoute`). Recommended: 05 lands first, or 06 rebases; alternatively 05 moves the admin handlers to `routes/admin/short-links.ts` so each spec owns one file (preferred — see T3).
- "What is an event" — unchanged domain docs; `get_item_stats` returns `startDate` and `startTime` (04) as stored, without interpretation.
- Service-worker denylist (01): no new server-rendered paths (`/mcp` is API-only and already outside the SPA).

## 8. Rollout

- No migration, no feature flag. Additive REST changes; existing endpoints keep their shapes (two gain optional fields).
- Deploy order: 03 (public-url helper) ideally before 05; otherwise T3's stub. 01/02/04/06 are independent.
- Remote MCP: new tools are live on deploy; existing sessions are in-memory and drop on restart (known, ADR-015), clients reconnect.
- Stdio MCP: users rebuild `packages/mcp` (`pnpm --filter @betel/mcp build`) and restart their MCP host; the build now produces a bundled `dist/index.js` (same path, same `bin`).
- Rollback: revert the commits; no data to undo (audit rows and short links created meanwhile stay valid).

## 9. Testing

Cypress stubs the API, and the MCP surfaces have no browser UI, so this feature is verified mainly by manual MCP-client checks and a scripted parity check. State this in the PR.

**Cypress (regression only)**

- `cypress/e2e/admin-short-links.cy.ts`: extend the stubbed `GET /api/admin/content/:id/short-links` and `POST …` fixtures with the new `url`, `itemTitle`, `destination` fields and assert the tab still renders and copies the link (guards 06's UI against the additive change). No new happy-flow spec is feasible.

**Automated parity check** (`pnpm --filter @betel/mcp parity`, T7)

- Spawns `dist/index.js` (stdio client via SDK `StdioClientTransport`) and connects to `BETEL_MCP_URL` with `MCP_SECRET` (`StreamableHTTPClientTransport`), calls `tools/list` on both, deep-compares `[name, description, inputSchema, annotations]`, prints a diff and exits 1 on mismatch. Run it before every commit that touches either server.

**Manual checks (local API + PostgreSQL, `pnpm dev:api`)**

1. Seed events across a DST boundary (2026-10-25 is the autumn change in Romania):
   ```sql
   INSERT INTO analytics_events (event_type, site_slug, item_id, occurred_at) VALUES
     ('link_click', '<slug>', '<item>', '2026-10-24 22:30:00+00'),  -- 2026-10-25 01:30 Bucharest
     ('link_click', '<slug>', '<item>', '2026-10-25 21:30:00+00'),  -- 2026-10-25 23:30 Bucharest
     ('link_click', '<slug>', '<item>', '2026-10-25 22:30:00+00'),  -- 2026-10-26 00:30 Bucharest
     ('site_visit', NULL, NULL, '2026-10-26 10:00:00+00');
   ```
   Expect `get_item_stats({ itemId, from: '2026-10-25', to: '2026-10-26' })` series: `2026-10-25 → 2`, `2026-10-26 → 1`. (UTC bucketing would give 1 / 2.)
2. Remote, raw JSON-RPC with curl (replace `$S`, `$SID`):
   ```bash
   curl -s -D - http://localhost:3100/mcp -H "Authorization: Bearer $S" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
   # take mcp-session-id from the response headers, then:
   curl -s http://localhost:3100/mcp -H "Authorization: Bearer $S" -H "mcp-session-id: $SID" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_analytics_overview","arguments":{"from":"2026-10-01","to":"2026-10-28"}}}'
   ```
   Check: totals match `SELECT event_type, COUNT(*) …` with the Bucharest bounds; `bySite` has one row per site plus `null`; `previous` covers 2026-09-03 → 2026-09-30.
3. Remote with the MCP Inspector (`npx @modelcontextprotocol/inspector`, transport Streamable HTTP, URL `http://localhost:3100/mcp`, bearer header): run every new tool once; confirm `readOnlyHint` shows on the four read tools.
4. Stdio with Claude Desktop / Inspector (`command: node packages/mcp/dist/index.js`, env `BETEL_EMAIL`, `BETEL_PASSWORD`, `BETEL_API_URL`): repeat the same calls; outputs must equal step 2/3 for the same DB.
5. `create_short_link`: with an item that has `data.link` → `url` is `${PUBLIC_BASE_URL}/s/<code>`, `destination` is the link, `/admin/logs` shows `short-link.create` (`via: 'mcp'` remote; service-account email on stdio); the link appears in the content editor's "Link-uri scurte" tab; `curl -I <url>` 302s to the destination (dev: hit the API port directly, the Vite proxy does not forward `/s/`). With an item that has no link → `warning` present. With a bad `siteSlug` → `site "<slug>" not found`. With a `deleted` item → `content item "<id>" not found`.
6. Validation matrix for dates (§6.8): future `to`, `from > to`, 367-day span, `2026-02-30`.
7. Hardening: 130 rapid `POST /mcp` from one IP → the last ones return 429; wrong secret of the right length → 401 (timing not asserted, just behaviour).
8. `pnpm lint` green in all packages; `pnpm --filter @betel/mcp build` produces a runnable bundled `dist/index.js` with the shebang.

## 10. Work breakdown

Sized for one developer each; T1 first, T2/T3 in parallel, then T4–T6, then T7–T8.

| # | Task | Files | Depends on |
|---|---|---|---|
| T1 | **Shared tool contract.** Create `packages/shared/src/mcp-tools.ts` with all 14 tool definitions (§6.2), add `zod` to `packages/shared/package.json` and the `./mcp-tools` export; add output types (`OverviewStats`, `ItemStats`, `TopItems`, `ShortLinkStats`, `ShortLinkWithUrl`) to `packages/shared/src/index.ts`. Switch `packages/mcp` build to esbuild bundling (`package.json` scripts, add `esbuild` devDependency, `@betel/shared` workspace dependency); verify `node dist/index.js` starts. | `packages/shared/package.json`, `packages/shared/src/mcp-tools.ts`, `packages/shared/src/index.ts`, `packages/mcp/package.json`, `pnpm-lock.yaml` | — |
| T2 | **Analytics service.** `resolveRange`, Bucharest bucketing SQL, the four query functions and the `RangeError`/`NotFoundError` classes (put the error classes in `packages/api/src/services/errors.ts` so T3 reuses them). | `packages/api/src/services/analytics-stats.ts`, `packages/api/src/services/errors.ts` | T1 (types) |
| T3 | **Short-link service + REST refactor.** `createShortLink` (validation, race-safe code generation, audit, `url`, `destination`, `warning`), `listShortLinks`, `deleteShortLink` (audit). Move `adminShortLinksRoutes` out of `routes/short-links.ts` into a new `routes/admin/short-links.ts` that calls the service (leave `shortLinkRedirectRoute` and `resolveUrl` where they are for 06; export `resolveUrl` so the service can reuse it for `destination`); update the import in `index.ts`. Add `GET /api/admin/short-links`. If 03 has not landed: add `services/public-url.ts` with 03's signature (temporary). | `packages/api/src/services/short-links.ts`, `packages/api/src/routes/admin/short-links.ts` (new), `packages/api/src/routes/short-links.ts` (remove admin handlers, export `resolveUrl`), `packages/api/src/index.ts`, (`packages/api/src/services/public-url.ts` if needed) | T1, T2 (errors), 03 |
| T4 | **REST analytics endpoints.** Four new `GET` routes mapping query params → service, errors → 400/404. | `packages/api/src/routes/admin/analytics.ts` | T2 |
| T5 | **Remote MCP.** Replace inline tool registrations with a loop over the shared contract + typed `handlers` record; implement the six new handlers via services; `timingSafeEqual`; route rate limit; keep existing card/media handlers' logic as is (only their schemas move). | `packages/api/src/routes/mcp.ts` | T1, T2, T3 |
| T6 | **Stdio MCP.** Same loop over the contract; six new handlers as REST pass-throughs; keep login/retry. Add `mimeType` passthrough note for `upload_media` parity. | `packages/mcp/src/index.ts` | T1, T3, T4 |
| T7 | **Parity script.** `packages/mcp/src/parity-check.ts` + `"parity"` script; reads `BETEL_MCP_URL`, `MCP_SECRET`, `BETEL_*`. | `packages/mcp/src/parity-check.ts`, `packages/mcp/package.json` | T5, T6 |
| T8 | **Docs + Cypress fixture.** Apply §12 (coordinator), update `admin-short-links.cy.ts` fixtures, add ADR-024 to the index, resolve the parity open question in `memory/open-questions.md`. | `cypress/e2e/admin-short-links.cy.ts`, docs listed in §12 | T3–T6 |

Suggested commits (branch `feat/mcp-analytics-short-links`): `feat(shared): add shared MCP tool contract` · `feat(analytics): add Bucharest date-range stats service and endpoints` · `feat(short-links): extract service with validation, audit and public URL` · `feat(mcp): add analytics and short-link tools to both servers` · `build(mcp): bundle stdio server with esbuild` · `test(mcp): add tools/list parity check` · `docs: …`.

## 11. Open questions

| # | Question | Recommended default |
|---|---|---|
| Q1 | Expose `delete_short_link` via MCP? | **No** in v1. Deletion is irreversible for links already printed on flyers/QR codes and the agent use cases are "create and report". Keep it in the admin UI; revisit once the API key layer gives per-client scopes. |
| Q2 | Allow custom (vanity) codes such as `/s/tabara2026` in `create_short_link`? | **No** in v1. It changes code validation on a table owned by 06 and adds a reserved-word problem (`admin`, `api`, …). If wanted later: optional `code` input, `^[a-z0-9-]{4,32}$`, rejected when it collides. |
| Q3 | Add a per-item `item_view` analytics event so "views" exist for events? | **Not now.** It needs public-app tracking changes and an impression definition (visible in viewport?). Tools state clearly that per-item data is clicks only. |
| Q4 | Switch the admin analytics dashboard from UTC to Europe/Bucharest days so it matches the MCP numbers? | **Yes, as a follow-up** (not in this spec; the dashboard is a different owner area). `analytics-stats.ts` takes a `timeZone` parameter internally so the dashboard endpoints can adopt it without rewriting queries. Until then, daily numbers near midnight differ by design and `range.timeZone` says so. |
| Q5 | Percentage change when the previous period is zero: `null` (this spec) or `100` (dashboard convention)? | **`null`** for the new endpoints/tools; agents must not report "+100 %" for 0 → 3. |
| Q6 | Emit MCP `structuredContent` / `outputSchema` in addition to the JSON text block? | **Later**, once both packages are on an SDK version that supports it; the text block stays for compatibility. |
| Q7 | Add a second, read-only secret (`MCP_READ_SECRET`) so a reporting-only agent cannot create content? | **No** — defer to the API key layer. Mention under Known risks. |
| Q8 | Default range 30 days, or match the dashboard's "week" preset? | **30 days** (`from = to − 29`); event announcements typically run for weeks. |

## 12. Doc integration

Ready-to-paste snippets; applied by the coordinator, not by this spec. Numbers for new BR entries are **not** reserved by the README (see summary coordination note); the coordinator assigns them.

**`docs/product/requirements.md`** — new subsection after "### MCP Content Creation":

```markdown
### MCP Analytics & Short Links
- FR-080: Both MCP surfaces expose `get_analytics_overview`: views, clicks, a generic `byEventType` map, per-site breakdown, day/week/month series and previous-period comparison for a Europe/Bucharest date range (default last 30 days, max 366). Optional `site` filter. **[Planned — spec 05]**
- FR-081: Both MCP surfaces expose `get_item_stats(itemId)`: clicks split by website / short link, per short link, per site, series, comparison and all-time totals; unknown or deleted items are errors. **[Planned — spec 05]**
- FR-082: Both MCP surfaces expose `get_top_items` (ranked by clicks in range, `limit` ≤ 50) and `get_short_link_stats` (by code, by item, or all). **[Planned — spec 05]**
- FR-083: Both MCP surfaces expose `create_short_link(itemId, label, siteSlug?)` and `list_short_links`. Creation validates item, label (1–100) and site, generates a unique 6-character code, audits `short-link.create` and returns the absolute URL (`PUBLIC_BASE_URL` + `/s/<code>`). The REST endpoint `POST /api/admin/content/:id/short-links` shares the same service and therefore the same validation, audit and `url`. **[Planned — spec 05]**
- FR-084: All MCP tools are declared once in `@betel/shared` (`src/mcp-tools.ts`) and registered from it by both servers; `pnpm --filter @betel/mcp parity` fails on any `tools/list` difference. `/mcp` compares `MCP_SECRET` in constant time and rate-limits `POST /mcp` to 120/min/IP. See ADR-024. **[Planned — spec 05]**
```

Amend **FR-023**: add `short-link.create`, `short-link.delete` to the recorded actions and remove "short link create/delete" from the not-yet-audited list. Amend **FR-044** admin endpoints: add `GET /api/admin/short-links`; note that list/create responses include `url`. Amend **FR-048**: "Two transports expose the same 14 tools (contract in `packages/shared/src/mcp-tools.ts`, ADR-024)" and list the six new names. Amend **FR-025**: add the four new endpoints under "API endpoints" with "(Europe/Bucharest days; used by the MCP tools)".

**`docs/domain/business-rules.md`** — new rules (numbers assigned by coordinator):

```markdown
- BR-040: Analytics date ranges in the range-based endpoints (`/api/admin/analytics/range`, `/items/:id/stats`, `/top-items`, `/short-links`) and in all MCP analytics tools are inclusive calendar days in Europe/Bucharest; a range spans at most 366 days and ends no later than today; the previous period is the equal-length window ending the day before `from`; percentage change is `null` when the previous period has no events. The older dashboard endpoints bucket by UTC days.
- BR-041: A short link can be created for any content item that is not `deleted` (drafts and archived items included). The label is 1–100 characters; the site override must be an existing site slug. Codes are 6 characters from `[a-z0-9]` and unique; generation retries on collision. Every creation and deletion is audit-logged (`short-link.create`, `short-link.delete`) regardless of the path (admin UI, REST, MCP).
```

**`docs/domain/entities.md`** — ShortLink: add "`url` (derived, `PUBLIC_BASE_URL` + `/s/<code>`, not stored)" to Notes; AnalyticsEvent: add "After a short link is deleted, its historical clicks (now `short_link_id IS NULL`) are reported as website clicks by every aggregation."

**`docs/architecture/security.md`** — Audit list: add `short-link.create`, `short-link.delete` (all paths). Rate limits line: replace "`/mcp` are not rate-limited" with "`POST /mcp` is rate-limited to 120/min per IP; `POST /api/auth/login` and `POST /api/setup` are not". Known risks row for `MCP_SECRET`: drop "compared with plain `!==`; no rate limit on `/mcp`", keep "one shared, full-access, non-expiring token".

**`docs/architecture/configuration.md`** — `PUBLIC_BASE_URL` row (owned by 03): append "Also used for the `url` field of short links returned by the admin API and the MCP `create_short_link` / `list_short_links` tools." Stdio MCP section: no change to variables; add a note that `pnpm --filter @betel/mcp parity` additionally reads `BETEL_MCP_URL` and `MCP_SECRET` (dev only).

**`docs/architecture/integrations.md`** — MCP section: "Both expose the same **14** tools, declared once in `packages/shared/src/mcp-tools.ts` (ADR-024): … plus `get_analytics_overview`, `get_item_stats`, `get_top_items`, `get_short_link_stats`, `create_short_link`, `list_short_links`." Table row "Business rules and audit": stdio "Enforced by the REST handlers and services" / remote "Services shared with the REST handlers (analytics, short links, group order); card/media rules still re-implemented".

**`docs/product/user-flows.md`** — add:

```markdown
### Flow 8 (AI agent) — Reporting on an event's performance through MCP
- Trigger: an editor asks the agent (Claude Desktop, Cursor, Claude iOS) how an announcement performed
- Steps: the agent finds the item id (`list_cards` / `get_top_items`), calls `get_item_stats` for the wanted range, optionally `get_short_link_stats` per channel, and summarises totals, trend vs the previous period and the best channel
- Success state: numbers match the admin dashboard's totals for the same Bucharest days
- Edge states: unknown or deleted item → tool error; no events in range → zeros, `previous.*ChangePct = null`

### Flow 9 (AI agent) — Creating a short link through MCP
- Trigger: an editor asks for a trackable link for a channel (WhatsApp group, flyer QR)
- Steps: `create_short_link(itemId, label, siteSlug?)`; the agent returns the `url`; the link appears in the content editor's "Link-uri scurte" tab and in `/admin/logs` as `short-link.create`
- Edge states: item without a link → `warning`, the link redirects to `/` until a link is set; unknown site → error
```

**`docs/product/roadmap.md`** — under "External API & integration layer": "- **MCP analytics and short links [planned — spec 05]:** `get_analytics_overview`, `get_item_stats`, `get_top_items`, `get_short_link_stats`, `create_short_link`, `list_short_links` on both surfaces; shared tool contract (ADR-024)."

**`docs/decisions/README.md`** — index row: `| [ADR-024](ADR-024-mcp-shared-tool-contract-and-service-layer.md) | MCP tool parity: shared tool contract and API service layer | Proposed |`

**`memory/open-questions.md`** — move "Should the remote `/mcp` endpoint be brought to parity…" to Resolved: "Shared contract + service layer, ADR-024 (spec 05); card/media rules remain re-implemented until migrated to services."

**ADR-015** — Update History entry (dated at merge): "Analytics and short-link tools use services shared with the REST handlers and a contract module shared with the stdio server (ADR-024); `/mcp` now rate-limited and constant-time compared."
