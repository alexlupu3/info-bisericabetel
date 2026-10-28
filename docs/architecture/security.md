# Security

All REST paths below include the `/api` prefix under which every API route is registered (`packages/api/src/index.ts`). The remote MCP endpoint (`/mcp`), the short-link redirect (`/s/:code`), `/uploads/*` and `/health` are outside that prefix. Environment variables are documented in [configuration.md](configuration.md).

## Security Baseline

### Authentication
- **Admin login:** `POST /api/auth/login` with email + password. Passwords are checked with `bcryptjs`. The response is a JWT signed with `@fastify/jwt` (HS256, secret `JWT_SECRET`; the API refuses to start without it). The token carries `sub`, `email`, `role` and `mustChangePassword` and expires after **8 hours**. There are no refresh tokens and no server-side revocation: a token stays valid until it expires, even if the user is deleted or their password is changed.
- **Token storage:** the admin SPA stores the token in `localStorage` (`betel-admin-token`) and sends it as `Authorization: Bearer <token>`. No cookies are used, so CSRF does not apply. In exchange, any XSS in the app origin could read the token.
- **Password storage:** bcrypt hashes with salt rounds 12, for all write paths (setup, user creation, reset, change password).
- **Forced password change:** new users and reset users get `must_change_password = true`. The admin SPA then routes the user only to the change-password screen. This is enforced **client-side only**: the API does not reject other requests from a user whose token has `mustChangePassword: true`. `POST /api/auth/change-password` requires the current password and a new password of at least 8 characters, and clears the flag.
- **First-admin bootstrap:** `POST /api/setup` creates a `super-admin` (password of at least 8 characters) **only when the `users` table is empty**. Once any user exists it returns 409. It is unauthenticated by design. On a fresh deployment, whoever calls it first becomes super-admin, so run it immediately after the first deploy (or use the `seed-admin` script).
- **Remote MCP:** `/mcp` requires `Authorization: Bearer <MCP_SECRET>`. It is registered only when `MCP_SECRET` is set. See [ADR-015](../decisions/ADR-015-remote-mcp-endpoint.md).
- **Stdio MCP:** uses a normal admin account (`BETEL_EMAIL` / `BETEL_PASSWORD`) through the login endpoint. See [ADR-012](../decisions/ADR-012-mcp-server.md).

### Authorization
- **Roles:** `admin` and `super-admin` (stored in `users.role`; note the hyphen). Checks are per-route `preHandler`s after `app.authenticate` verifies the JWT.
- **admin or super-admin:** content (`/api/admin/content/*`), groups, media, short links, analytics, and read-only listings of languages (`GET /api/admin/languages`) and UI translations (`GET /api/admin/translations`).
- **super-admin only:**
  - users: `/api/admin/users` list, create, delete, and `POST /api/admin/users/:id/reset-password`
  - site edits: `PATCH /api/admin/sites/:slug`
  - language management: `POST/PATCH/DELETE /api/admin/languages[/:code]`
  - UI translation writes: `PUT /api/admin/translations`, `POST /api/admin/translations/generate`
  - audit log: `/api/admin/logs`
  - error logs: `/api/admin/error-logs`
  - SQL console: `POST /api/admin/sql` (see "SQL console" below)
- **Public (no auth):** `GET /api/sites`, `GET /api/content`, `GET /api/languages`, `GET /api/translations`, `POST /api/events`, `POST /api/errors`, `POST /api/auth/login`, `POST /api/setup`, `GET /s/:code`, `/uploads/*`, `/health`.

### Rate limiting
`@fastify/rate-limit` is registered with `global: false`, so only routes that opt in are limited:
- `POST /api/events`: 60 requests per minute per IP.
- `POST /api/errors`: 20 requests per minute per IP.
- `POST /api/admin/sql`: 30 requests per minute (plugin default key, per IP).

`POST /api/auth/login`, `POST /api/setup` and `/mcp` are **not** rate-limited.

### CORS
`@fastify/cors` is registered with `{ origin: true }`, which reflects **any** request `Origin` back in `Access-Control-Allow-Origin` (credentials are not enabled). In production the SPA and API share one origin, so CORS is not needed at all. This configuration exists for local development convenience and is broader than necessary. Because admin requests authenticate with a bearer header rather than cookies, another site cannot ride an admin's session, but it can freely call the public endpoints from a browser. See [ADR-006](../decisions/ADR-006-single-container-deployment.md).

### Uploads
- `POST /api/admin/media` (admin or super-admin): at most 5 MB (`bodyLimit` and multipart `fileSize`), MIME type must start with `image/`, and the file is decoded by `sharp`, auto-rotated, resized to at most 1980 px wide and **re-encoded to WebP**. The original bytes are never stored or served, which strips metadata and neutralises polyglot or non-image payloads. Files are named `<uuid>.webp` and served statically from `/uploads/`.
- The remote MCP `upload_media` tool applies the same pipeline and the same 5 MB check (on the decoded bytes). Because the image arrives base64-encoded in JSON, `POST /mcp` sets a route-level `bodyLimit` of 8 MiB (bearer auth runs in a `preHandler`, after the body is parsed, so unauthenticated callers can also send bodies up to this size).
- Any reverse proxy in front of the container must allow request bodies of at least 5 MB, or 8 MB for remote MCP uploads to `/mcp`.

### Sensitive data handling
- Stored personal data is limited to admin email addresses, password hashes and audit entries. Visitor analytics (`analytics_events`) record event type, site, item, URL and time, with no IP addresses or user identifiers. Frontend error logs (`error_logs`) store message, stack, URL, site and a `device` JSON blob supplied by the client.
- Temporary passwords (user creation and reset) are 16 hex characters (`randomBytes(8)`). They are returned once in the API response for out-of-band delivery and are never stored in plaintext or logged.
- Visitors' browsers contact Google Fonts directly (IP address exposure). See `integrations.md`.

### Secret management
- Secrets (`JWT_SECRET`, `DATABASE_URL` / database password, `MCP_SECRET`, `OPEN_ROUTER_API_KEY`, stdio MCP credentials) come from environment variables: CapRover app settings in production, `.env` locally. They must never be committed. See [configuration.md](configuration.md).
- Rotating `JWT_SECRET` invalidates all admin sessions. Rotating `MCP_SECRET` disconnects all remote MCP clients. Both require a redeploy or restart.

## Super-Admin Password Reset (Implemented, 2026-03-21)

`POST /api/admin/users/:id/reset-password` lets a super-admin reset the password of any `admin`-role account.

**Authorization:** super-admin only. Super-admin accounts cannot be targeted: the endpoint returns HTTP 400 if the target's `role !== 'admin'`, which prevents one super-admin from taking over another.

**Password generation:** a 16-character hex temporary password (`randomBytes(8).toString('hex')`, the same method as user creation), hashed with bcryptjs (salt rounds 12). The plaintext is returned once (`{ tempPassword }`) for the super-admin to pass on out-of-band.

**Forced change:** `must_change_password` is set to `true` (enforced client-side, see above).

**Audit logging:** recorded with `action: 'reset_password'`, `entityType: 'user'`, `detail.targetEmail`.

**No email sent:** the temporary password is shown in the admin UI only. Email delivery is planned (FR-030/FR-031, see `integrations.md`).

## SQL Console (Implemented, 2026-10-26, FR-049)

`POST /api/admin/sql` lets a super-admin run one SQL statement against the production database. Decision and alternatives: [ADR-018](../decisions/ADR-018-sql-console.md). Code: `packages/api/src/services/sql-console.ts` (validator and runner) and `packages/api/src/routes/admin/sql.ts`.

**Layers, in order:**
1. Super-admin `preHandler` and a rate limit of 30 requests per minute.
2. Structural validation: non-empty, at most 20,000 characters, no unterminated string, quoted identifier, dollar-quote or block comment, balanced parentheses, exactly one statement.
3. Dangerous-command filter, always on (the full list is in FR-049): schema, privilege, session and transaction-control statements, `COPY`, `DO`, file/process/config functions, UPDATE/DELETE without a WHERE at their own nesting level, and any data-changing statement that references `users`, `audit_log` or `_migrations`. It is a token-level denylist over SQL with comments and strings stripped. It is defence in depth, **not a sandbox**: it cannot stop `WHERE true` or a clever read.
4. Execution in its own transaction, `READ ONLY` unless the request sets `readOnly: false`, `SET LOCAL statement_timeout` of 10 s, 500 rows returned.
5. Audit: `sql_query` (`entityType: 'sql'`, `entityId` null, `detail` = `{ query` (first 2,000 characters)`, readOnly, truncated }`) is written **before** execution and **fails closed**: if the insert fails the API returns 500 and the query is not run. Filter rejections log `sql_query_blocked` best effort with `detail.reason`. Execution failures are not logged separately.
6. UI: a warning modal (`role="alertdialog"`) before every run; the confirm button must be pressed twice within 5 seconds.

**Residual risks:** see the SQL console rows in "Known risks and incident concerns".

## Password Reset Tokens (Planned, FR-031)

When FR-031 (self-service password reset) is implemented, the following design must be followed:

- A new `password_reset_tokens` table stores each reset request: `id` (UUID), `userId` (FK to admin users), `token` (random, high-entropy string), `expiresAt` (timestamp).
- Tokens must be short-lived. Recommended TTL: 1 hour.
- Only a hash of the token (e.g. SHA-256) is stored in the database. The raw token is sent once by email and never stored in plaintext.
- A token is single-use and must be invalidated immediately after a successful reset.
- `POST /api/auth/forgot-password` must return a generic success message whether or not the email is registered, to avoid user enumeration.
- `POST /api/auth/reset-password` must verify token existence, hash match and expiry before accepting a new password.
- Both endpoints must be rate-limited.

## Compliance and Risk

### Regulatory considerations
The system processes very little personal data (admin accounts, anonymous analytics). The main GDPR-relevant points are the Google Fonts request from visitors' browsers and the free-form `device` and `url` fields in error logs. Self-hosting fonts would remove the former.

### Audit requirements
FR-023 requires every content and configuration change to be logged (who, what, when). `logAudit` (`packages/api/src/db/audit.ts`) writes to `audit_log` and never throws, so an audit failure is silently dropped rather than failing the request. The log is viewable by super-admins at `/api/admin/logs`.

Currently audited: content create, update, publish, archive, delete, restore, permanent-delete and duplicate; content and group translation upsert and delete; `group.delete`; language create, update and delete; `translation.bulk-upsert`; `translation.ai-generate`; `reset_password`; `sql_query` and `sql_query_blocked` (SQL console); and `media.upload` (remote MCP only). Writes through the remote MCP endpoint are attributed to `mcp@betel` with no user ID.

Permanent delete purges an item's history by design: `DELETE /api/admin/content/:id/permanent` deletes every audit entry with that `entity_id` (and the item's analytics events) before writing a single `content.permanent-delete` entry, which records who removed the item and when. `audit_log` is therefore not append-only for permanently deleted items; this is intended (repository owner decision, 2026-10-17). See [content-model.md](../domain/content-model.md).

The SQL console is the exception to the best-effort rule: `sql_query` is written before the query runs and fails closed (see "SQL console").

**Not audited (gaps against FR-023):** group create, update and reorder; content reordering; admin user create and delete; site edits; short-link create and delete; media upload and delete through the admin UI.

### Known risks and incident concerns
| Risk | Impact | Mitigation / follow-up |
|---|---|---|
| No rate limit on `POST /api/auth/login` | Online password guessing | Add a per-IP/per-email limit with `@fastify/rate-limit` |
| CORS reflects any origin | Broader than needed; no direct admin exposure because auth is header-based | Restrict to the app's own origin, or disable CORS in production |
| JWT in `localStorage`, 8 h lifetime, no revocation | Stolen token usable until expiry; deleted users keep access until expiry | Keep XSS surface minimal; consider a token version or deny list |
| `mustChangePassword` enforced only in the SPA | A user with a temporary password can call the API directly | Reject non-change-password requests in `authenticate` when the flag is set |
| `POST /api/admin/users` accepts any `role` string, and `DELETE /api/admin/users/:id` has no self-delete or last-super-admin guard | Misconfigured roles; accidental lock-out | Validate role against `admin` / `super-admin`; add guards |
| `MCP_SECRET` is one shared, full-access, non-expiring token; compared with plain `!==`; no rate limit on `/mcp` | Leaked secret grants card and media write access | Use a long random value, rotate on suspicion, and move to the planned API key layer |
| `POST /api/setup` is unauthenticated until the first user exists | Takeover of a fresh deployment | Create the first super-admin immediately after the first deploy |
| SQL console runs on the same connection pool and database role as the app | A bypassed filter has full application-level DB rights | Treat the filter as defence in depth; consider a dedicated limited role and pool (ADR-018 follow-up) |
| SQL console bypasses API business rules (soft-delete, group-delete cascade, translation jobs, FR-035) | Data written through it can violate domain rules | Prefer admin pages; use writes sparingly |
| SQL console can read `users.password_hash` | Hash exposure to any super-admin (or a stolen super-admin token) | Super-admin only; every run is audited; keep tokens short-lived |
| Audit gaps (see above) and silent audit failures | Incomplete forensic trail | Extend `logAudit` coverage |
