# Integrations

## Phase 1 — Launch
No external service integrations at launch. The system is fully self-contained.

## OpenRouter (AI Auto-Translation)

Integrated as of 2026-04-20 (switched from Anthropic SDK to OpenRouter on 2026-04-20). The API is used for background, fire-and-forget translation of content items and group titles into all enabled non-default languages whenever a create or update is performed via the admin API.

- **Service:** `packages/api/src/services/ai-translation.ts`
- **Model:** `anthropic/claude-haiku-4-5` via OpenRouter — chosen for low latency and cost efficiency
- **Trigger points:** `POST /api/admin/content`, `PATCH /api/admin/content/:id`, `POST /api/admin/groups`, `PATCH /api/admin/groups/:id`
- **Execution model:** `setImmediate` (fire-and-forget) — HTTP response is returned before translation runs; see ADR-010 for the decision rationale
- **Environment variable:** `OPEN_ROUTER_API_KEY` (optional; feature is silently disabled when absent)
- **Failure handling:** errors are logged to stderr; they do not affect admin operations or surface to the user

See [ADR-010](../decisions/ADR-010-ai-auto-translation-fire-and-forget.md) for the full decision record.

## MCP Server (AI Agent Integration)

Implemented 2026-05-13. The `packages/mcp/` package (`@betel/mcp`) is a stdio MCP (Model Context Protocol) server that allows an AI agent (e.g. Claude Desktop, Cursor, or similar tooling) to create and manage church content via a natural-language chat interface.

- **Transport:** stdio — the server is launched as a subprocess by the MCP host. No network port is opened by the MCP server itself.
- **Authentication:** the server authenticates with the admin REST API using email+password credentials from environment variables. On startup (and on any HTTP 401 response), it calls `POST /api/auth/login` to obtain an 8-hour JWT. The JWT is cached in memory and refreshed automatically on expiry — long-running sessions require no manual intervention.
- **Data access:** HTTP calls to the existing admin REST API (`packages/api`). The MCP server does not access the database directly. This preserves audit logging and server-side business rule enforcement. See ADR-012 for the full rationale.
- **Package:** `packages/mcp/src/index.ts` — compiled to `dist/index.js`, exposed as the `betel-mcp` binary.

### Environment Variables

| Variable          | Default                        | Required | Purpose                                    |
|-------------------|--------------------------------|----------|--------------------------------------------|
| `BETEL_API_URL`   | `http://localhost:3000/api`    | No       | Base URL of the admin REST API             |
| `BETEL_EMAIL`     | —                              | Yes      | Admin account email for JWT authentication |
| `BETEL_PASSWORD`  | —                              | Yes      | Admin account password for JWT authentication |

`BETEL_EMAIL` and `BETEL_PASSWORD` must be kept secret and must not be committed to version control. Use a dedicated admin service account (not a personal account) so audit log entries are attributed consistently and credentials can be rotated independently.

### Tool Inventory

| Tool           | Description                                                    | API endpoint                                    |
|----------------|----------------------------------------------------------------|-------------------------------------------------|
| `list_sites`   | List all church sites (slugs, names, accent colours)           | `GET /api/sites` (public)                       |
| `list_groups`  | List all content groups and their IDs                          | `GET /api/admin/groups`                         |
| `list_media`   | List images in the media library with their URLs               | `GET /api/admin/media`                          |
| `list_cards`   | List all card content items including drafts and archived      | `GET /api/admin/content` (filtered to `card`)   |
| `create_card`  | Create a new card in draft state                               | `POST /api/admin/content`                       |
| `update_card`  | Update fields on an existing card (partial update)             | `PATCH /api/admin/content/:id`                  |
| `publish_card` | Publish a draft card so it appears on the public hub           | `POST /api/admin/content/:id/publish`           |
| `upload_media` | Upload an image from base64 data; returns media row with URL   | `POST /api/admin/media` (multipart)             |

`create_card` and `update_card` write to the `data` JSONB field of the content item. Supported data fields: `title`, `description`, `thumbnail`, `startDate`, `endDate`, `link`, `cta`. Top-level fields `sites[]`, `exclusiveSite`, and `groupId` are also supported.

`upload_media` accepts: `imageData` (required, base64 bytes without `data:` URI prefix), `filename` (optional, for reference only), and `mimeType` (optional, standalone CLI only; defaults to `image/jpeg`; must start with `image/`). The decoded buffer is capped at 5 MB. In the standalone CLI the raw bytes are posted to the API; in the in-process MCP a Sharp pipeline rotates, resizes to ≤ 1980 px, and re-encodes to WebP at 82 % quality before writing to disk. The returned row includes `id` and `url`; the URL can be passed directly as `thumbnail` in `create_card` or `update_card`.

### Scope and Relationship to the Planned API Key Layer

The initial implementation covers cards only (the most action-oriented content type). Richtext, Poster, and Embedded YouTube Video types are not exposed.

The roadmap originally planned a dedicated API key authentication layer as the foundation for all machine-client integrations (MCP, Zapier, etc.). That layer has not been built yet. The MCP server ships now using JWT auth as a practical shortcut — the API key layer remains a planned Phase 2 item. When implemented, the MCP server can be migrated to API key auth by replacing the login call with an API key header, with no changes to the transport or tool layer.

See [ADR-012](../decisions/ADR-012-mcp-server.md) for the full architectural decision record.

## Future Considerations
- **CloudFront CDN:** may be used in the future for image and static asset delivery. Not a constraint for Phase 1, but the image handling service should avoid hardcoding asset URLs in a way that would make a CDN migration painful.
- **Zapier / automation tools:** Phase 2 API key layer will enable third-party integrations (see MCP section above for current status).
- **Email (Resend):** [Planned — no release date] Transactional email will be handled by [Resend](https://resend.com) — an HTTPS-based API service with a free tier of 3 000 emails/month. Chosen over SMTP because the VPS hosting environment has port 25/587 restrictions that make SMTP unreliable. Implementation plan:
  - Install the `resend` npm package in `packages/api`.
  - One-time DNS setup: add SPF and DKIM records on the domain registrar for `info.bisericabetel.ro`.
  - Two new environment variables required (see `example.env`): `RESEND_API_KEY` and `EMAIL_FROM`.
  - Used for: (1) delivering temporary passwords on new admin account creation (FR-030), and (2) sending time-limited password reset links (FR-031).
