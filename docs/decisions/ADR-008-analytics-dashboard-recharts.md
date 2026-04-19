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
| `GET /admin/analytics/overview?period=day\|week\|month` | Returns current-period and previous-period aggregates for views and clicks, plus per-day breakdowns for both periods |
| `GET /admin/analytics/items/:itemId/daily` | Returns daily click counts for a specific item over the last 90 days |

Legacy endpoints (`/lifetime`, `/daily`, `/items`) are preserved unchanged.

### Database

Migration `0006_analytics_item_idx.sql` adds a partial index on `(item_id, occurred_at)` WHERE `item_id IS NOT NULL`. This makes the per-item daily query efficient without affecting write throughput on the `analytics_events` table.

### Frontend component structure

`packages/app/src/admin/components/analytics/` (6 files):

- **StatCard** — displays a metric total with a ± % change badge; clicking the card toggles the active metric on the trend chart.
- **TrendChart** — dual-line Recharts `LineChart` comparing current period (orange solid) vs. previous period (gray dashed).
- **PeriodSelector** — day / week / month toggle that drives the data fetch.
- **ContentTable** — table of content items sorted by total clicks; clicking a row triggers the item drill-down.
- **ItemDailyModal** — modal overlay with a Recharts bar chart of daily clicks for the selected item (last 90 days).
- **index.ts** — barrel export.

`AnalyticsPage.tsx` was rewritten to compose these components. All data fetching is co-located in the page component; sub-components are purely presentational.

### Dependency

`recharts` added to `packages/app/package.json`. Recharts is tree-shakeable; only the chart components used are included in the admin bundle. The public PWA bundle is unaffected (admin JS is code-split via `React.lazy`).

## Consequences

- Admins can now see at a glance whether visit and click counts are trending up or down relative to the prior equivalent period.
- Per-item drill-down makes it practical to evaluate individual content piece performance.
- Recharts is a new production dependency in `packages/app`; it must be kept up-to-date alongside other React dependencies.
- The partial DB index marginally increases index storage on `analytics_events` but has no impact on ingest write performance (events are inserted asynchronously).
- Legacy API endpoints are preserved; any future cleanup of the dead routes should be tracked as a separate task.
