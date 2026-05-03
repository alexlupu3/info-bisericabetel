# ADR-008: Analytics Dashboard Rebuilt with Recharts and Period Comparison

**Date:** 2026-04-19
**Status:** Accepted

## Context

The original analytics dashboard (`/admin/analytics`) displayed lifetime totals in stat cards, a per-site breakdown table, and a flat daily activity table. The page was useful for auditing raw numbers but provided no at-a-glance trend visibility and no way to compare performance across time periods. Admins had to mentally diff rows in the table to detect movement.

Two specific gaps drove the rebuild:

1. **No period comparison.** There was no way to see whether this week's clicks were up or down relative to last week without exporting data manually.
2. **No per-item drill-down.** Clicks were aggregated at the total level; there was no way to see the trend for a specific content item.

## Options Considered

**Option A — Extend the existing table-based page**
Add a period selector that reloads the table for the chosen window. Simple, no new dependencies. Does not address the trend-visibility gap; tables of daily rows are hard to interpret quickly.

**Option B — Rebuild with a charting library (Recharts)**
Replace the table layout with interactive stat cards, a line chart for trend comparison, and a drill-down modal per content item. Recharts was already being evaluated for other potential dashboards in the admin tool; it is React-native, tree-shakeable, and MIT-licensed.

**Option C — Embed an external BI tool (e.g. Metabase, Grafana)**
Much more capability but introduces an external service dependency, contradicts NFR-008 (no vendor lock-in), and is significant operational overhead for a small analytics surface.

## Decision

Option B — rebuild with Recharts.

The rebuild introduces a controlled, lightweight dependency (Recharts in `packages/app`) and no new runtime services. The design stays within the existing admin SPA and requires only two new API endpoints. The legacy endpoints are preserved so any external tooling or scripts consuming them continue to work.

## Architecture

### New API endpoints (in `packages/api/src/routes/admin/analytics.ts`)

| Endpoint | Description |
|---|---|
| `GET /admin/analytics/overview?period=day\|week\|month[&site=slug]` | Returns current-period and previous-period aggregates for views and clicks, plus per-day breakdowns for both periods. Optional `site` param scopes results to a single site. |
| `GET /admin/analytics/items[?site=slug]` | Returns content items ranked by total link clicks. Optional `site` param scopes to a single site. |
| `GET /admin/analytics/items/:itemId/daily[?site=slug]` | Returns daily click counts for a specific item over the last 90 days. Optional `site` param scopes to a single site. |

Legacy endpoints (`/lifetime`, `/daily`) are preserved unchanged. `/items` was already listed above — it now additionally accepts the `site` query parameter.

### Database

Migration `0006_analytics_item_idx.sql` adds a partial index on `(item_id, occurred_at)` WHERE `item_id IS NOT NULL`. This makes the per-item daily query efficient without affecting write throughput on the `analytics_events` table.

### Frontend component structure

`packages/app/src/admin/components/analytics/` (7 files):

- **StatCard** — displays a metric total with a ± % change badge; clicking the card toggles the active metric on the trend chart.
- **TrendChart** — dual-line Recharts `LineChart` comparing current period (orange solid) vs. previous period (gray dashed).
- **PeriodSelector** — day / week / month toggle that drives the data fetch.
- **SiteFilter** — dropdown for selecting a site slug; default value is empty string, which the page translates to `undefined` when calling the API (meaning "all sites / Toate"). Fetches available sites from `GET /api/sites` via react-query.
- **ContentTable** — table of content items sorted by total clicks; clicking a row triggers the item drill-down.
- **ItemDailyModal** — modal overlay with a Recharts bar chart of daily clicks for the selected item (last 90 days); accepts an optional `site` prop that is forwarded to the API.
- **index.ts** — barrel export.

`AnalyticsPage.tsx` owns a `site` state string (empty = all sites). Both `SiteFilter` and `PeriodSelector` render in the page header. The `site` value is included in all react-query keys so queries re-run automatically on site change. All data fetching is co-located in the page component; sub-components are purely presentational.

### Dependency

`recharts` added to `packages/app/package.json`. Recharts is tree-shakeable; only the chart components used are included in the admin bundle. The public PWA bundle is unaffected (admin JS is code-split via `React.lazy`).

## Consequences

- Admins can now see at a glance whether visit and click counts are trending up or down relative to the prior equivalent period.
- Per-item drill-down makes it practical to evaluate individual content piece performance.
- Recharts is a new production dependency in `packages/app`; it must be kept up-to-date alongside other React dependencies.
- The partial DB index marginally increases index storage on `analytics_events` but has no impact on ingest write performance (events are inserted asynchronously).
- Legacy API endpoints are preserved; any future cleanup of the dead routes should be tracked as a separate task.

---

## Amendment — 2026-05-02: Per-Link Click Breakdown in Trend Chart Tooltip

### Context

When the Clicks metric is active on the trend chart, the aggregate total in the tooltip gave no indication of which links drove the number. Admins had to cross-reference the Content clicks table manually.

### Decision

Extend the `GET /admin/analytics/overview` response with per-link click breakdown data attached to each current-period bucket, and render it in the `TrendChart` tooltip when the clicks metric is active.

### Implementation details

**API (`packages/api/src/routes/admin/analytics.ts`)**

A second SQL query runs per overview request, grouping `link_click` events by `(bucket, item_id, ci.data->>'title')` for the current period only. Results are merged into the existing current-series entries as:

```
clickBreakdown?: [{ itemId, title, clicks }]  // sorted desc by clicks, capped at 10
otherClicks?: number                           // residual count when > 10 links exist
```

The `title` field is sourced from `ci.data->>'title'` (Romanian base field) because the admin UI is Romanian-only per ADR-009 rule 1. The breakdown query is not run for the previous period — previous-period tooltip lines remain plain.

The constant `MAX_BREAKDOWN_PER_BUCKET = 10` caps the list; if more distinct links exist in a bucket, their aggregate click count is returned as `otherClicks` and displayed as "+ N alte linkuri".

**Frontend types (`packages/app/src/admin/api/client.ts`)**

`OverviewSeries` extended with optional `clickBreakdown: ClickBreakdownItem[]` and `otherClicks?: number`. New exported interface: `ClickBreakdownItem { itemId: string; title: string; clicks: number }`.

**Frontend component (`packages/app/src/admin/components/analytics/TrendChart.tsx`)**

`CustomTooltip` now accepts a `metric` prop. The breakdown section (labelled list of link titles + click counts, followed by the residual line if present) renders only when `metric === 'clicks'` and `clickBreakdown` is present on the hovered entry. When `metric === 'views'` the tooltip is unchanged.

Test hooks: `data-testid="click-breakdown"` on the breakdown container; `data-testid="breakdown-item"` on each row.

**Cypress (`cypress/e2e/admin-analytics.cy.ts`)**

Two new tests: tooltip breakdown visible when clicks metric active; breakdown absent when views metric active.

### Constraints

- Breakdown data is only attached to current-period buckets; the query is cheap because it is already scoped to the current-period date range.
- The 10-item cap with residual is a product decision — it keeps the tooltip scannable without scrolling.

---

## Amendment — 2026-05-03: Per-Item CSV Export

### Context

Admins needed a way to get raw click data out of the system for offline analysis (e.g. spreadsheets, reporting to church leadership). The analytics dashboard surfaces aggregated views but provides no way to access event-level detail beyond looking at the DB directly.

### Decision

Add a `GET /api/admin/analytics/items/:itemId/export` endpoint that returns all historical `link_click` events for a given content item as a downloadable CSV, and surface it as a Download icon button on each row of the Content clicks table.

### Implementation details

**API (`packages/api/src/routes/admin/analytics.ts`)**

New endpoint: `GET /admin/analytics/items/:itemId/export?site=<slug>`

- Auth: admin/super-admin Bearer token (same guard as all other admin analytics endpoints).
- Queries `analytics_events` for all `link_click` events matching the item, optionally filtered by `site_slug` when the `site` query param is provided.
- Sets `Content-Type: text/csv` and `Content-Disposition: attachment; filename="clicks-<itemId>.csv"`.
- CSV columns: `Timestamp`, `Site`, `Titlu`, `URL`.
- No time range limit — the full historical dataset is returned.
- CSV serialization is done inline with manual string concatenation; no CSV library dependency was introduced.

**Decision: no time range filter on export.** The export is positioned as a full-history report for a single item. Adding a date-range UI was deferred — the current admin need is a complete data pull, and scoping can be done in a spreadsheet tool after download. This may be revisited if export file sizes become a concern.

**Frontend (`packages/app/src/admin/api/client.ts`)**

New `downloadFile(url, filename)` helper:
- Fetches the URL with the `Authorization: Bearer <token>` header (required because the export endpoint is auth-protected).
- Receives the response as a blob, creates a temporary object URL, programmatically clicks a hidden `<a>` element, then revokes the URL. This keeps the download in-browser without needing a signed URL or server-side redirect.
- `api.analytics.exportItemClicks(itemId, title, site?)` composes the endpoint URL (including optional `site` param) and derives the download filename from the item title.

**Frontend (`packages/app/src/admin/components/analytics/ItemsTable.tsx`)**

- Accepts a new `site?: string` prop forwarded from `AnalyticsPage`.
- Each row renders a Download icon button that calls `exportItemClicks`; `e.stopPropagation()` prevents the row click from also opening the item drill-down modal.

**Cypress (`cypress/e2e/admin-analytics.cy.ts`)**

Two new tests: (1) clicking the Download button fires the export request with the correct auth header; (2) clicking the Download button does not open the item modal.

### Constraints

- The export covers all time — it is not paginated and not windowed. For items with very high click volumes this could produce large files; this is an accepted trade-off for the current scale of the project.
- The `site` scoping relies on the `SiteFilter` state already present in `AnalyticsPage`; the export automatically respects whatever site is currently active in the dashboard view.
