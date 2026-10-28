# ADR-023: Event start time as Bucharest wall-clock `HH:mm`; event-time helpers in `@betel/shared`

- **Status:** Proposed
- **Date:** 2026-10-28
- **Related:** [ADR-017](ADR-017-timezone-policy.md) (time zone policy), [ADR-014](ADR-014-i18n-strategy.md), [ADR-012](ADR-012-mcp-server.md), [ADR-015](ADR-015-remote-mcp-endpoint.md)
- **Implements:** FR-075 – FR-079 (rules in BR-035, BR-013)
- **Spec:** `docs/product/specs/04-event-hours.md`

## Context

Events need an optional starting hour (single-day events only, per the product owner). Three things had to be decided before several developers build against the field in parallel (feeds, structured data, notifications, MCP tools):

1. **How the time is stored.** The existing dates are calendar days anchored to the church's zone (ADR-017: "event days belong to the church"), the API container runs in UTC, and visitors and editors can be anywhere. A time has to join that model without re-opening the timezone bugs ADR-017 fixed.
2. **Whether the time changes visibility.** Expiry is currently day-granular and deliberately generous (visible through the end of the day in Romania, BR-015).
3. **Where the date/time logic lives.** The `startDate` comparator already exists twice (`packages/api/src/services/group-order.ts` and `packages/app/src/admin/pages/ContentPage.tsx`), and the date formatter lives in the public card component. Four other specs need the same "when" text and the same instant; a third and fourth copy would drift. `packages/shared` has so far held TypeScript types only.

## Options Considered

### Storage

1. **Separate `data.startTime` as `HH:mm` wall clock in `Europe/Bucharest` (chosen).** Pros: keeps `startDate` a plain calendar day (no change to expiry, sort, validation, MCP schemas or existing rows); the editor types what the poster says; the string is canonical and comparable; the instant is derived on demand with the correct DST offset. Cons: a second field to keep consistent (single-day rule); the zone is implicit (a constant, as in ADR-017).
2. **Make `startDate` an ISO date-time with offset (`2026-11-14T18:00:00+02:00`).** Pros: one field, self-describing. Cons: every reader of `startDate` (SQL expiry `left(…,10)` would still work, but `isItemPast`, sort, MCP validation, the admin `<input type="date">`, feeds) must learn two shapes; offset must be computed at write time in every client (admin browser, two MCP surfaces); date-only events keep the old shape anyway, so the ambiguity remains. Rejected.
3. **Store a UTC instant in a new column (`starts_at TIMESTAMPTZ`).** Pros: native ordering and comparison in SQL. Cons: a migration for an optional, rarely-set field; the wall-clock the editor entered is lost under DST edge cases and must be reconstructed for display; duplicates the date already in JSONB. Rejected.

### Visibility

1. **Keep expiry date-based (chosen).** The hub serves as the day's programme; a card must survive the first minutes of its own event, and "visible through the end of the day in Romania" (BR-015) stays one rule.
2. **Hide after the start time (plus a grace period).** Needs a per-instant comparison on the server and the client and a grace constant nobody asked for; contradicts BR-015. Rejected; an explicit end time can be added later if wanted.

### Location of the helpers

1. **`packages/shared/src/event-time.ts`, pure and `Intl`-only (chosen).** Verified: a runtime import from `@betel/shared` type-checks under the API's `NodeNext` tsconfig, runs under `tsx`, and is inlined by the API's `esbuild --bundle` build; the app already resolves it through Vite. One implementation for validation, sort key, DST-aware instant, ISO string and per-locale text.
2. **Duplicate in `packages/api/src/services/time.ts` and `packages/app/src/dates.ts`.** Follows the current pattern but makes a third copy of the comparator and a second of the DST offset logic; the four consuming specs would each pick one. Rejected.
3. **Server-side only, exposing pre-formatted strings in `GET /api/content`.** Locale-dependent output would have to be rendered per request or per locale; breaks the client-side i18n model (ADR-014) and HTTP caching (ADR-013). Rejected.

## Decision

1. `data.startTime` is an optional string `HH:mm` (24-hour) on the shared date fields of every content type, meaning the wall-clock time in `Europe/Bucharest` on `data.startDate`. It is valid only for single-day items (`startDate` set; `endDate` absent or equal). Writes that break the invariant are rejected (HTTP 400 / MCP error), never silently corrected (BR-035).
2. The start time never affects expiry; BR-015 governs visibility. It is the secondary key of chronological group ordering (BR-013).
3. `packages/shared` may contain runtime code, restricted to pure, dependency-free helpers that run identically in the browser and in Node. The event-time module (`CHURCH_TIME_ZONE`, `EventSchedule`, `isClockTime`, `isSingleDayEvent`, `invalidStartTime`, `eventStartInstant`, `eventStartIso`, `utcOffsetAt`, `formatEventWhen`, `formatEventTime`, `eventSortKey`, `compareEventSchedules`) is the single implementation used by the API, the admin, the public hub and the feed / SEO / notification features. DST is handled by computing the zone offset with `Intl` at the resolved instant (non-existent wall-clock times resolve one hour later; ambiguous ones to the later, standard-time instant).
4. Times are shared across locales and sites, like dates (ADR-014 unchanged). Public rendering uses `Intl.DateTimeFormat` in the visitor's language with `timeZone: 'Europe/Bucharest'`; no per-language strings are introduced.

## Implementation

- Shared: `packages/shared/src/event-time.ts` (+ `event-time.test.ts`, run by `pnpm test:unit`).
- API: validation in `routes/admin/content.ts` (`POST`, `PATCH` on the merged data) and `routes/mcp.ts`; sort in `services/group-order.ts`.
- App: `admin/pages/ContentPage.tsx` (time input with progressive disclosure, Romanian copy), `public/components/content/CardItem.tsx` (`formatEventWhen`, `<time dateTime>`).
- Stdio MCP: `startTime` on `create_card` / `update_card` in `packages/mcp/src/index.ts`.
- No migration; no configuration.

## Consequences

- Feeds (spec 02), JSON-LD (spec 03) and notifications (spec 01) get a correct offset-qualified instant and localized text from one place; none of them parses dates.
- `packages/shared` becomes a runtime dependency of the API bundle and the app; it must stay free of Node- or DOM-only APIs and of third-party packages.
- `CHURCH_TIME_ZONE` exists in three modules until `api/services/time.ts` and `app/dates.ts` re-export the shared constant (planned chore).
- The single-day restriction is enforced in three write paths; relaxing it later (times on multi-day events, an `endTime`) is a validation and rendering change with no data migration.
- The timed/untimed ordering rule (untimed first on the same day) is a product convention baked into `eventSortKey`; changing it changes group order for existing items.
