# ADR-015: Remote MCP Endpoint Inside the API Process

- **Status:** Accepted (records an implementation that already exists)
- **Date:** 2026-05-13 (implemented); recorded 2026-10-17
- **Related:** [ADR-012](ADR-012-mcp-server.md) (stdio MCP server), [ADR-006](ADR-006-single-container-deployment.md) (single container)
- **Implements:** FR-048 (remote transport)

## Context

[ADR-012](ADR-012-mcp-server.md) introduced `packages/mcp`, a stdio MCP server. Stdio only works when the MCP host can launch a local subprocess (Claude Desktop, Cursor, and similar tools). Mobile clients such as the Claude iOS app can only reach remote MCP servers over HTTP, so the stdio server cannot be used from a phone.

On 2026-05-13 (commit `82406a6`, "add remote MCP endpoint for Claude iOS integration") a second MCP surface was added to the API process so content can be managed from a phone. No ADR was written at the time. This ADR records the decision after the fact and makes its trade-offs explicit, because it departs from the data-access decision in ADR-012.

## Options Considered

1. **Expose the stdio server over HTTP as a separate process or container.** Wrap `packages/mcp` in an HTTP transport and keep it a REST client of the API, as ADR-012 chose. This keeps one set of business rules but adds a second deployable, which conflicts with the single-container model (ADR-006).
2. **Mount an MCP endpoint inside the API that calls the REST handlers internally** (for example via `app.inject`). This keeps a single process and reuses the existing handlers, validation and audit logging. It needs a way to authenticate the internal calls as an admin user.
3. **Mount an MCP endpoint inside the API that talks to the database directly through Drizzle (chosen).** This keeps a single process and is the simplest code, but the tool handlers re-implement logic that already exists in the REST handlers.

## Decision

Option 3. `packages/api/src/routes/mcp.ts` registers an MCP server (`@modelcontextprotocol/sdk`, `StreamableHTTPServerTransport`) on the main Fastify instance.

- **Routes:** `POST /mcp` (initialize or continue a session), `GET /mcp` (SSE stream for server-initiated messages), `DELETE /mcp` (close a session). The plugin is registered **without** the `/api` prefix, so the path is `/mcp`, not `/api/mcp`.
- **Enablement:** the routes are only registered when the `MCP_SECRET` environment variable is set. Without it the API logs "MCP_SECRET not configured — /mcp endpoint disabled" and the paths fall through to the SPA fallback.
- **Authentication:** a `preHandler` compares the request's `Authorization` header with the exact string `Bearer <MCP_SECRET>`. There are no users, roles or expiry: anyone holding the secret has full access to the tools.
- **Sessions:** transports are kept in an in-memory `Map` keyed by the `mcp-session-id` header. They are removed on `DELETE /mcp` or when the transport closes. Sessions do not survive a restart.
- **Tools:** the same eight tool names as the stdio server: `list_sites`, `list_groups`, `list_media`, `list_cards`, `create_card`, `update_card`, `publish_card`, `upload_media`.
- **Data access:** every tool reads and writes through Drizzle (`db` from `packages/api/src/db/client.ts`). The REST API is not involved.
- **Re-implemented rules:** the tool handlers duplicate logic from `routes/admin/content.ts` and `routes/admin/media.ts`:
  - `create_card` takes advisory lock `1001` and appends at `MAX(order_position) + 1`, the same global ordering scheme as `POST /api/admin/content`.
  - `exclusiveSite` validation (the slug must exist), forcing `sites = []` when exclusive, and the "`sites` is required when clearing `exclusiveSite`" guard (BR-006 to BR-008).
  - `update_card` and `publish_card` reject items that are not cards, are deleted, or (for publish) are not drafts.
  - `upload_media` decodes base64, checks 5 MB (the effective limit is about 750 KB, see Consequences), and runs the same `sharp` pipeline (rotate, max 1980 px wide, WebP quality 82) before inserting a `media` row.
  - AI auto-translation is scheduled through `scheduleContentTranslation` (ADR-010).
- **Audit:** writes call `logAudit` with `userEmail: 'mcp@betel'` and no `userId`. `detail.via = 'mcp'` is recorded for `content.create`, `content.update`, `content.publish` and `media.upload`.

## Consequences

- **Works from mobile:** remote MCP clients can manage cards from a phone with no extra deployable. The endpoint ships in the same container and on the same origin as the app.
- **Two implementations of the same tools.** `packages/mcp` (stdio, via REST, see ADR-012) and `/mcp` (remote, direct DB access) expose identical tool names but run different code. A rule change in the REST handlers must be copied manually into `routes/mcp.ts`, which is exactly the duplication ADR-012 rejected. Known divergences at the time of writing:
  - `POST /api/admin/content` re-sorts a group chronologically by `startDate` when an item is created with a `groupId` (FR-046). The remote `create_card` does **not**: it appends the card at the global maximum position.
  - The REST create path runs the per-type required-field check (`missingRequiredField`). The remote tool relies on its own zod schema instead.
- **Weaker audit attribution.** All remote MCP writes are attributed to the synthetic actor `mcp@betel`, not to a person, so the audit log cannot tell who held the secret. Admin-UI media uploads are not audited at all, while remote MCP uploads are (`media.upload`), so the audit trail differs depending on which path was used.
- **Shared-secret auth.** `MCP_SECRET` is a single long-lived bearer token with full write access to cards and media. It cannot be scoped or revoked per client; rotating it means changing the environment variable and redeploying. The comparison is a plain string comparison (not constant-time), and `/mcp` has no rate limit. See [security.md](../architecture/security.md).
- **Upload size is capped by the body limit, not the 5 MB check.** `/mcp` uses Fastify's default 1 MiB `bodyLimit` (no override in `index.ts` or the route), and the image travels base64-encoded inside JSON, so images larger than roughly 750 KB are rejected before the tool's 5 MB check runs.
- **Uploaded URLs cannot be used directly as thumbnails.** `upload_media` returns a relative `/uploads/<uuid>.webp` URL, but `create_card` / `update_card` validate `thumbnail` with `z.string().url()` (absolute URLs only). Workaround: prefix the public origin. Fix: accept relative media URLs in both MCP servers' schemas.
- **In-memory session state.** Sessions are lost on every redeploy and are never expired except by `DELETE /mcp` or transport close. This is acceptable for one container with few clients, but it would break with more than one replica.
- **Follow-up options** (not scheduled): (a) refactor the shared rules (ordering, exclusive-site handling, group re-sort, upload pipeline) into service functions used by both the REST handlers and the MCP tools; or (b) switch the remote tools to call the REST handlers internally (Option 2), using the planned API key layer for authentication.
