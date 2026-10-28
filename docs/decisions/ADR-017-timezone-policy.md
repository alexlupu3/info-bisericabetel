# ADR-017: Time zone policy

- **Status:** Accepted
- **Date:** 2026-10-25
- **Related:** [ADR-008](ADR-008-analytics-dashboard-recharts.md), [ADR-012](ADR-012-mcp-server.md), [ADR-015](ADR-015-remote-mcp-endpoint.md), [ADR-016](ADR-016-postgresql-only.md)
- **Implements:** FR-010, FR-024, FR-043 (rules in BR-015)

## Context

The church is in Romania, but the API container runs in UTC and visitors and editors can be anywhere. Time handling had drifted:

- Event expiry compared the visitor's or editor's local day (client) and `::date` casts (server), so events vanished early for visitors east of Romania, and a malformed legacy date made the whole public feed return 500.
- The admin form re-saved `expiresAt` as a bare date (UTC midnight), shifting it.
- Analytics bucketed by UTC or by the DB session time zone (`CURRENT_DATE`). Day-bucketed charts were also empty because postgres-js returns `date` columns as JS `Date` objects, which never matched the `YYYY-MM-DD` keys.
- Public card dates showed the previous day west of UTC.

## Options Considered

1. **Everything in one fixed zone (Romania or UTC).** Simple, but analytics read wrongly for admins elsewhere, and UTC would expire events at 02:00 or 03:00 Romanian time.
2. **Everything in the viewer's zone, including event expiry.** Events would disappear at different moments for different people, which is the bug being fixed.
3. **Two rules (chosen):** instants in UTC and shown in the viewer's zone; event calendar days anchored to the church's zone.

## Decision

1. **Storage is UTC.** Logs, analytics and `expiresAt` are `TIMESTAMPTZ` instants.
2. **Display is in the viewer's zone, chosen by the frontend.** The admin client sends its IANA zone as the `tz` query parameter on every analytics call; the API never guesses. Missing `tz` falls back to `Europe/Bucharest`; invalid names and numeric offsets return 400. Buckets (days, hours, "today", custom ranges, previous-period comparison) are computed in that zone, with window bounds built as `(day::timestamp AT TIME ZONE tz)` so results do not depend on the DB session zone. Hourly series (`period=day`) have one slot per elapsed hour of the local day — 23 or 25 on DST change days — keyed by `date_trunc('hour', occurred_at, tz)`, so the repeated wall-clock hour is not merged and the skipped one is not invented; the hour label can therefore repeat. CSV timestamps are wall-clock in `tz`, labelled `Timestamp (<tz>)`.
3. **Event days belong to the church.** `data.startDate` / `data.endDate` are `YYYY-MM-DD` calendar days (validated on admin write and on both MCP surfaces). An item is current through the end of that day in `Europe/Bucharest`, for every visitor, editor and server zone. A date-only `expiresAt` means the same (stored as the start of the next Bucharest day); a full timestamp is an exact instant and must carry `Z` or an explicit offset.
4. **Calendar days are never converted.** Event dates are displayed as stored, with no time zone shifting.

Domain rule: BR-015. Expiry details: `docs/domain/content-model.md` → Expiration Behavior.

## Implementation

- API: `packages/api/src/services/time.ts` (calendar-day helpers, `parseExpiresAt`, `invalidEventDate`); public filter in `routes/content.ts` (text comparison against the Bucharest day); analytics in `routes/admin/analytics.ts`.
- App: `packages/app/src/dates.ts` (`viewerTimeZone`, `calendarDay`, `formatCalendarDay`), `packages/app/src/content-expiry.ts` (`isItemPast()`, shared by the public safety-net filter and the admin badge).
- Tests: `cypress/e2e/timezone-handling.cy.ts` (stubbed API; the backend is verified manually).

## Consequences

- Events never disappear before the end of their last day in Romania, and one malformed legacy date can no longer break the public feed.
- Analytics are correct for admins in any zone, at the cost of an extra `tz` parameter on each call.
- Event dates are day-granular only; an event ending at a specific hour is not expressible (use `expiresAt` with a full timestamp).
- The Bucharest zone name is a constant in both packages (`CHURCH_TIME_ZONE`); moving the church would mean changing both. Sites remain data, but this zone is deliberately church-wide, not per site.
- Existing rows with non-`YYYY-MM-DD` dates are not migrated; they are compared as text, so they may stay visible or be hidden arbitrarily (a value starting with a letter sorts after every date and never expires) until an editor fixes the date.
