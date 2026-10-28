# ADR-024: MCP tool parity via a shared tool contract and an API service layer

- **Status:** Proposed
- **Date:** 2026-10-28
- **Related:** [ADR-012](ADR-012-mcp-server.md) (stdio MCP via REST), [ADR-015](ADR-015-remote-mcp-endpoint.md) (remote MCP with direct DB access), [ADR-008](ADR-008-analytics-dashboard-recharts.md) (analytics endpoints; 2026-10-25 amendment adds `tz`), [ADR-017](ADR-017-timezone-policy.md) (time zone policy the range endpoints follow), [ADR-011](ADR-011-short-link-dynamic-url-resolution.md) (short-link destination resolved at redirect time; the service only reports it)
- **Implements:** FR-080 – FR-084 (proposed, spec `docs/product/specs/05-mcp-analytics-short-links.md`); rules BR-040 and BR-041 (proposed)

## Context

Two MCP surfaces exist: the stdio server in `packages/mcp` (a REST client, ADR-012) and the remote `/mcp` endpoint inside the API (direct Drizzle access, ADR-015). They expose the same eight tool names, but every tool is written twice: descriptions and zod schemas are copy-pasted, and the handlers run different code. ADR-015 already records the resulting divergences and lists two follow-ups: (a) extract shared rules into services used by both the REST handlers and the remote tools, or (b) make the remote endpoint call the REST handlers internally. One step of (a) was taken on 2026-10-17 (`services/group-order.ts`).

Spec 05 adds six tools (four analytics reads, two short-link tools). Adding them the current way would double the amount of duplicated code and make a third divergence source: the new analytics queries are time-zone sensitive (calendar days in a `tz` zone, ADR-017), and the short-link creation gains validation and audit rules that must be identical on the admin UI path, the REST path and both MCP paths.

Since `fix/timezone-handling` (PR #17, ADR-017) every admin analytics endpoint already accepts `tz` (IANA name, default `Europe/Bucharest`, offsets rejected), buckets with `AT TIME ZONE tz` and builds sargable day bounds through `services/time.ts`. The new range queries must build on that, not introduce a second convention.

Constraints:

- The stdio server must keep working from Claude Desktop / Cursor (subprocess, no DB access), and the remote endpoint must stay inside the single container (ADR-006).
- `@betel/shared` is consumed as raw TypeScript (`main: ./src/index.ts`); `packages/api` bundles with esbuild, `packages/mcp` compiles with `tsc` and runs `node dist/index.js`, which cannot import `.ts` from a workspace package at runtime.
- Audit logging (FR-023) must hold on every write path.

## Options Considered

1. **Keep duplicating** (status quo). Smallest diff per tool; drift grows linearly with the tool count; no test can catch a tool registered on one side only.
2. **Remote endpoint calls REST via `app.inject`** (ADR-015 option b). One implementation of the rules, but it needs a synthetic admin identity/JWT for internal calls, doubles the error-mapping surface (HTTP → tool error), and is blocked on the API key layer for a clean identity.
3. **Shared tool contract + service layer (chosen).** Tool names, descriptions, zod input schemas and annotations live once in `@betel/shared` (`src/mcp-tools.ts`); both servers register tools by iterating that module with a fully typed `handlers` record, so a missing handler is a type error. For the new tools, business logic lives in `packages/api/src/services/*` and is called by the REST handlers *and* the remote tools; the stdio tools call REST and pass the JSON through, so the three outputs agree by construction. A parity script catches registration drift (`tools/list` diff) and, on seeded data, response drift (cross-transport call comparison). Requires `@betel/shared` to take a `zod` dependency and `packages/mcp` to bundle with esbuild like the API.

## Decision

Option 3.

1. **One contract.** Every MCP tool (the existing eight and all future ones) is declared in `packages/shared/src/mcp-tools.ts` (export path `@betel/shared/mcp-tools`). A tool exists on both surfaces or on neither. Other specs that touch tool inputs edit this file: 04 adds `startTime` and 07 adds `location` to `create_card` (optional) and `update_card` (`nullable().optional()`, where `null` deletes the key from the merged data — the generic `null`-deletes path in the remote `update_card` is added by whichever of 04 and 07 lands first), 06 adds `previewMode` to `create_short_link`. The strings are fixed in those specs; spec 05 §6.2 shows them in place.
2. **Logic in services — for the six new tools.** For `get_analytics_overview`, `get_item_stats`, `get_top_items`, `get_short_link_stats`, `create_short_link` and `list_short_links`, `packages/mcp` and `routes/mcp.ts` are adapters only: the rules live in `packages/api/src/services/` (`analytics-stats.ts`, `short-links.ts`, alongside the existing `group-order.ts`) and are used by the REST handlers as well. The remote tool returns the service result unchanged; the REST handler returns the same result; the stdio tool returns the REST body unchanged. **Exception — the eight legacy tools** (`list_sites`, `list_groups`, `list_media`, `list_cards`, `create_card`, `update_card`, `publish_card`, `upload_media`): only their *schemas* move to the contract; their remote handlers keep their current Drizzle re-implementation in `routes/mcp.ts` and their stdio handlers keep calling REST, so their results are not guaranteed identical (ADR-015 lists the known differences). Migrating their logic to services is the natural next step and is not blocked by this ADR.
3. **Parity is tested at two levels.** `pnpm --filter @betel/mcp parity` connects to both surfaces and (a) diffs `tools/list` (name, description, input schema, annotations) — this proves *schema* parity only; (b) with `--calls`, against one seeded database, calls the five read-only new tools with a fixed input set on both transports and deep-compares the parsed JSON responses (key order and whitespace are not part of the contract) — this proves *response* parity for the new tools. Either difference fails the run. It is run before commits that touch either server or the analytics/short-link services (manual, since Cypress stubs the API).
4. **Build.** `packages/shared` gains `zod` as its first runtime dependency; `packages/mcp` switches from `tsc` output to an esbuild bundle (`dist/index.js` with a shebang banner, same `bin`). Both packages pin the same `@modelcontextprotocol/sdk` minor.
5. **Time zone — reuse ADR-017.** Range-based analytics services and endpoints take the same optional `tz` parameter as the existing analytics endpoints (IANA name, default `CHURCH_TIME_ZONE` = `Europe/Bucharest`, invalid names and numeric offsets rejected with the existing 400 message), resolved by the existing `resolveTimeZone()` (moved from `routes/admin/analytics.ts` into `services/time.ts` together with the `dayStart` fragment so both share one copy). `today`, defaults and the previous period use `calendarDayIn` / `addDays` / `daysBetween`; buckets use `date_trunc(…, occurred_at AT TIME ZONE tz)::date::text`; bounds are `dayStart(day, tz)` and stay sargable on `occurred_at`. `range.timeZone` in every response echoes the effective zone. The MCP tools expose `tz` too, so an agent gets church-local days by default and can ask for another zone exactly as the admin client does.
6. **Zero baseline.** The new endpoints/tools compute the percentage change per metric and return `null` when that metric's own previous-period value is 0; the pre-existing dashboard endpoints keep their `100`/`0` convention so the dashboard badges do not change (BR-040, proposed).

## Implementation

Spec 05, §6 and §10: `packages/shared/src/mcp-tools.ts`, `packages/api/src/services/analytics-stats.ts`, `packages/api/src/services/time.ts` (gains `resolveTimeZone`, `dayStart`), `packages/api/src/services/short-links.ts`, `packages/api/src/services/errors.ts`, `packages/api/src/routes/admin/short-links.ts` (admin handlers moved out of `routes/short-links.ts`, which keeps the redirect for spec 06), `packages/api/src/routes/admin/analytics.ts` (new range endpoints; existing ones only re-import the moved helpers), `packages/api/src/routes/mcp.ts`, `packages/mcp/src/index.ts`, `packages/mcp/src/parity-check.ts`.

## Consequences

- **Drift becomes structural, not procedural — for the new tools.** Adding a tool to one surface only does not compile; changing a description or schema changes both; the `--calls` parity mode catches a behavioural difference in the new tools. Logic drift is still possible for the eight legacy card/media handlers until they move to services; for them the contract guarantees the advertised schema, not the result.
- **REST shapes are the new tools' shapes.** Any change to a range endpoint's or short-link endpoint's response changes the stdio tool output; the remote tool changes identically because it returns the same service value. Response changes must therefore be additive, as for any public API.
- **`@betel/shared` is no longer types-only.** `packages/app` must import only from the root entry (types) and never from `@betel/shared/mcp-tools`, or zod ends up in the public bundle.
- **`packages/mcp` build changes.** Users rebuild once; the binary path and env vars are unchanged.
- **One time-zone convention.** Dashboard and MCP/range numbers agree whenever the same `tz` is used; an admin browsing from another zone and an agent using the default see different day buckets by design (ADR-017), and `range.timeZone` makes it visible. The only intentional difference between the two endpoint families is the zero-baseline percentage (`null` vs `100`/`0`).
- **Auth model unchanged.** The remote endpoint still uses one shared secret (hardened with constant-time compare and a rate limit); per-client scopes wait for the API key layer. ADR-012's "audit attributed to a real account" holds for stdio; remote writes stay attributed to `mcp@betel`.
- **Follow-ups:** migrate the legacy card/media handlers to services (closes the remaining ADR-015 divergence and lets `--calls` cover them); consider MCP `structuredContent` once the SDK version supports it on both packages.
