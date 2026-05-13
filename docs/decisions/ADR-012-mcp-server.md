---
status: Accepted
date: 2026-05-13
---

# ADR-012: MCP Server via HTTP API with JWT Authentication

## Status
Accepted

## Context

Phase 2 of the roadmap identified an MCP (Model Context Protocol) server as a desirable integration point, allowing an AI agent to create and manage church content via a chat interface. The roadmap also planned a dedicated API key authentication layer as the foundation for all third-party integrations (MCP, Zapier, etc.).

Three implementation decisions needed to be made:

1. **Data access strategy**: should the MCP server call the existing admin REST API, or connect directly to the database?
2. **Authentication strategy**: should the server use the planned-but-unbuilt API key layer, or the existing JWT email+password auth?
3. **Scope**: which content types and operations should be exposed in the initial implementation?

## Options Considered

### Decision 1: Data Access

#### Option A: Direct database access
The MCP server connects to the PostgreSQL database directly (bypassing the API).

- Pros: fewer network hops; no dependency on the API process being healthy.
- Cons: (1) audit logging is implemented in the API request handlers — bypassing the API means write operations are not logged, violating FR-023 (hard requirement); (2) business rules such as the `exclusiveSite`/`sites[]` mutual exclusivity constraint (BR-006–008) live in the API layer and would need to be duplicated and kept in sync; (3) introduces a second consumer of the raw DB schema, coupling two packages to schema internals.

#### Option B: HTTP calls to the existing admin REST API (chosen)
The MCP server is a thin HTTP client that authenticates with and calls the same `POST /api/admin/content`, `PATCH /api/admin/content/:id`, and `POST /api/admin/content/:id/publish` endpoints used by the admin UI.

- Pros: (1) audit logging is preserved automatically — every write goes through handlers that record `content.create`, `content.update`, etc.; (2) all existing business rules are enforced in a single place; (3) no schema duplication; (4) the MCP server has no knowledge of the database and therefore no schema coupling.
- Cons: extra network round-trips; the MCP server depends on the API process being reachable.

### Decision 2: Authentication

#### Option A: Wait for the API key layer
The roadmap planned a dedicated API key management system (super-admin UI + `api_keys` table + API middleware) as the proper auth mechanism for machine clients.

- Pros: clean separation of session (JWT) and machine (API key) credentials; revocable per-key; no shared password.
- Cons: the API key layer does not exist yet and building it adds significant scope. Blocking MCP shipping on API key infrastructure delays a useful capability.

#### Option B: JWT via email+password (chosen)
The MCP server calls `POST /api/auth/login` with `BETEL_EMAIL` and `BETEL_PASSWORD` at startup (and on any 401 response) to obtain an 8-hour JWT. The JWT is cached in memory and used for all subsequent requests.

- Pros: zero new infrastructure; ships immediately; the token refresh strategy (re-login on 401) handles JWT expiry transparently.
- Cons: uses a real admin credential rather than a dedicated machine credential; the API key layer remains a future item.

### Decision 3: Scope

Initial implementation is limited to card content items (`type = 'card'`) because cards are the most action-oriented content type (they have a title, description, CTA, link, and date fields — enough to represent a church event or announcement fully). Richtext, Poster, and Embedded YouTube Video types require additional handling (rich HTML, image uploads) that is deferred.

## Decision

- **Data access**: Option B — HTTP calls to the existing admin REST API.
- **Authentication**: Option B — JWT via email+password credentials from environment variables. The API key layer remains a planned Phase 2 item independent of the MCP server.
- **Transport**: stdio (standard MCP convention for local/subprocess clients such as Claude Desktop, Cursor, or similar AI tooling).
- **Scope**: cards-only for the initial release. Read tools for sites, groups, and media are also exposed to give the AI agent enough context to create well-scoped cards.

## Implementation

Package: `packages/mcp/` (`@betel/mcp`). Entry point: `src/index.ts`. Built to `dist/index.js` via TypeScript. The binary is exposed as `betel-mcp` in `package.json#bin`.

**Environment variables (all required at startup except `BETEL_API_URL`):**

| Variable        | Default                          | Purpose                              |
|-----------------|----------------------------------|--------------------------------------|
| `BETEL_API_URL` | `http://localhost:3000/api`      | Base URL of the admin REST API       |
| `BETEL_EMAIL`   | —                                | Admin account email for JWT login    |
| `BETEL_PASSWORD`| —                                | Admin account password for JWT login |

**Tool inventory (7 tools):**

| Tool           | HTTP method & path                          | Auth       |
|----------------|---------------------------------------------|------------|
| `list_sites`   | `GET /api/sites`                            | Public     |
| `list_groups`  | `GET /api/admin/groups`                     | Bearer JWT |
| `list_media`   | `GET /api/admin/media`                      | Bearer JWT |
| `list_cards`   | `GET /api/admin/content` (filtered to cards)| Bearer JWT |
| `create_card`  | `POST /api/admin/content`                   | Bearer JWT |
| `update_card`  | `PATCH /api/admin/content/:id`              | Bearer JWT |
| `publish_card` | `POST /api/admin/content/:id/publish`       | Bearer JWT |

**Token refresh strategy:** the JWT is cached in the module-level `cachedToken` variable. On startup it is `null`; the first API call triggers `login()`. If any subsequent request returns HTTP 401, `login()` is called again before retrying once. This handles the 8-hour JWT expiry transparently for long-running MCP sessions.

**`create_card` and `update_card` data fields** operate on the `data` JSONB column of the `content_items` table:
`title`, `description`, `thumbnail`, `startDate`, `endDate`, `link`, `cta`. Top-level fields `sites[]`, `exclusiveSite`, and `groupId` are also accepted.

## Consequences

- **Audit log preserved**: all MCP-initiated writes appear in the audit log under the credentials of the configured admin account, attributed to whoever owns `BETEL_EMAIL`.
- **Business rules enforced**: the existing server-side validation (e.g. `exclusiveSite`/`sites[]` mutual exclusivity) applies to MCP writes without any duplication.
- **API key layer deferred**: the planned Phase 2 API key system is unblocked by this decision — it remains on the roadmap. When implemented, the MCP server can be migrated to API key auth by swapping the login call for an API key header.
- **Credential management**: `BETEL_EMAIL` and `BETEL_PASSWORD` must be kept secret and not committed to version control. The admin account used for MCP should be a dedicated service account to allow audit log attribution and independent revocation (by changing the password).
- **Cards-only scope**: richtext, poster, and video content types are not exposed. The tool inventory is intentionally minimal for the first release; additional tools can be added without changing the transport or auth layer.
- **Dependency**: the MCP server requires the API process (`packages/api`) to be running and reachable at `BETEL_API_URL`.

See [integrations.md](../architecture/integrations.md) for the full environment variable table and deployment notes.
