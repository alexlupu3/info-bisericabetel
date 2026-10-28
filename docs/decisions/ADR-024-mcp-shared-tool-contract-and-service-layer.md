# ADR-024: MCP Tool Parity via a Shared Tool Contract and an API Service Layer

- **Status:** Proposed
- **Date:** 2026-10-28
- **Related:** [ADR-012](ADR-012-mcp-server.md) (stdio MCP via REST), [ADR-015](ADR-015-remote-mcp-endpoint.md) (remote MCP with direct DB access), [ADR-008](ADR-008-analytics-dashboard-recharts.md) (analytics endpoints)
- **Implements:** FR-080 – FR-084 (spec `docs/product/specs/05-mcp-analytics-short-links.md`)

## Context

Two MCP surfaces exist: the stdio server in `packages/mcp` (a REST client, ADR-012) and the remote `/mcp` endpoint inside the API (direct Drizzle access, ADR-015). They expose the same eight tool names, but every tool is written twice: descriptions and zod schemas are copy-pasted, and the handlers run different code. ADR-015 already records the resulting divergences and lists two follow-ups: (a) extract shared rules into services used by both the REST handlers and the remote tools, or (b) make the remote endpoint call the REST handlers internally. One step of (a) was taken on 2026-10-17 (`services/group-order.ts`).

Spec 05 adds six tools (four analytics reads, two short-link tools). Adding them the current way would double the amount of duplicated code and make a third divergence source: the new analytics queries are time-zone sensitive (Europe/Bucharest calendar days), and the short-link creation gains validation and audit rules that must be identical on the admin UI path, the REST path and both MCP paths.

Constraints:

- The stdio server must keep working from Claude Desktop / Cursor (subprocess, no DB access), and the remote endpoint must stay inside the single container (ADR-006).
- `@betel/shared` is consumed as raw TypeScript (`main: ./src/index.ts`); `packages/api` bundles with esbuild, `packages/mcp` compiles with `tsc` and runs `node dist/index.js`, which cannot import `.ts` from a workspace package at runtime.
- Audit logging (FR-023) must hold on every write path.

## Options Considered

1. **Keep duplicating** (status quo). Smallest diff per tool; drift grows linearly with the tool count; no test can catch a tool registered on one side only.
2. **Remote endpoint calls REST via `app.inject`** (ADR-015 option b). One implementation of the rules, but it needs a synthetic admin identity/JWT for internal calls, doubles the error-mapping surface (HTTP → tool error), and is blocked on the API key layer for a clean identity.
3. **Shared tool contract + service layer (chosen).** Tool names, descriptions, zod input schemas and annotations live once in `@betel/shared` (`src/mcp-tools.ts`); both servers register tools by iterating that module with a fully typed `handlers` record, so a missing handler is a type error. Business logic lives in `packages/api/src/services/*` and is called by the REST handlers *and* the remote tools; the stdio tools call REST and pass the JSON through, so the three outputs agree by construction. A `tools/list` parity script catches registration drift. Requires `@betel/shared` to take a `zod` dependency and `packages/mcp` to bundle with esbuild like the API.

## Decision

Option 3.

1. **One contract.** Every MCP tool (the existing eight and all future ones) is declared in `packages/shared/src/mcp-tools.ts` (export path `@betel/shared/mcp-tools`). A tool exists on both surfaces or on neither. Other specs that touch tool inputs (04 `startTime`, 06 preview fields) edit this file.
2. **Logic in services.** `packages/mcp` and `routes/mcp.ts` are adapters only. New rules go into `packages/api/src/services/` (`analytics-stats.ts`, `short-links.ts`, existing `group-order.ts`) and are used by the REST handlers as well. The remote tool returns the service result unchanged; the REST handler returns the same result; the stdio tool returns the REST body unchanged.
3. **Parity is tested.** `pnpm --filter @betel/mcp parity` connects to both surfaces, diffs `tools/list` (name, description, input schema, annotations) and fails on any difference. It is run before commits that touch either server (manual, since Cypress stubs the API).
4. **Build.** `packages/shared` gains `zod` as its first runtime dependency; `packages/mcp` switches from `tsc` output to an esbuild bundle (`dist/index.js` with a shebang banner, same `bin`). Both packages pin the same `@modelcontextprotocol/sdk` minor.
5. **Time zone.** Range-based analytics services bucket by named zone `Europe/Bucharest` (PostgreSQL `AT TIME ZONE`), with sargable bounds on `occurred_at`. The older dashboard endpoints stay UTC until migrated (spec 05, Q4).

The card and media tools keep their current re-implemented handlers in `routes/mcp.ts` for now; only their *schemas* move to the shared contract. Migrating their logic to services is the natural next step and is not blocked by this ADR.

## Implementation

Spec 05, §6 and §10: `packages/shared/src/mcp-tools.ts`, `packages/api/src/services/analytics-stats.ts`, `packages/api/src/services/short-links.ts`, `packages/api/src/services/errors.ts`, `packages/api/src/routes/admin/short-links.ts` (admin handlers moved out of `routes/short-links.ts`, which keeps the redirect for spec 06), `packages/api/src/routes/admin/analytics.ts` (new range endpoints), `packages/api/src/routes/mcp.ts`, `packages/mcp/src/index.ts`, `packages/mcp/src/parity-check.ts`.

## Consequences

- **Drift becomes structural, not procedural.** Adding a tool to one surface only does not compile; changing a description or schema changes both. Logic drift is still possible for the legacy card/media handlers until they move to services.
- **REST shapes are the tool shapes.** Any change to a range endpoint's response changes the stdio tool output; the remote tool changes identically because it returns the same service value. Response changes must therefore be additive, as for any public API.
- **`@betel/shared` is no longer types-only.** `packages/app` must import only from the root entry (types) and never from `@betel/shared/mcp-tools`, or zod ends up in the public bundle.
- **`packages/mcp` build changes.** Users rebuild once; the binary path and env vars are unchanged.
- **Two time-zone conventions coexist** (UTC dashboard vs Bucharest MCP/range endpoints) until the dashboard is migrated; `range.timeZone` in every response makes this explicit.
- **Auth model unchanged.** The remote endpoint still uses one shared secret (hardened with constant-time compare and a rate limit); per-client scopes wait for the API key layer. ADR-012's "audit attributed to a real account" holds for stdio; remote writes stay attributed to `mcp@betel`.
- **Follow-ups:** migrate card/media handlers to services (closes the remaining ADR-015 divergence); migrate dashboard endpoints to the Bucharest service; consider MCP `structuredContent` once the SDK version supports it on both packages.
