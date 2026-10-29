# Integrations

The system is self-hostable and has no **required** external services. It does have two optional outbound integrations, OpenRouter on the server and Google Fonts in the browser, plus two MCP surfaces for AI agents. All environment variables are documented in [configuration.md](configuration.md). This page links there instead of repeating them.

## OpenRouter (AI Auto-Translation)

In use since 2026-04-20 (moved from the Anthropic SDK to OpenRouter the same day). Content items and group titles are translated in the background into every enabled non-default language whenever they are created or updated through the admin API or the remote MCP endpoint.

- **Service:** `packages/api/src/services/ai-translation.ts`, which calls `https://openrouter.ai/api/v1` (OpenAI-compatible `/chat/completions`) with native `fetch`.
- **Model:** `anthropic/claude-haiku-4.5` (the exact string in code), chosen for low latency and cost.
- **Content and group translation — trigger points:** `POST /api/admin/content`, `PATCH /api/admin/content/:id`, `POST /api/admin/content/:id/duplicate`, `POST /api/admin/groups`, `PATCH /api/admin/groups/:id`, and the remote MCP `create_card` / `update_card` tools.
- **Content and group translation — execution model:** fire-and-forget via `setImmediate`. The HTTP response returns before translation runs ([ADR-010](../decisions/ADR-010-ai-auto-translation-fire-and-forget.md)).
- **UI string generation:** the super-admin "generate" action (`POST /api/admin/translations/generate`) is **not** fire-and-forget. The handler awaits `generateMissingUiTranslations`, returns `{ generated }` when done, and responds HTTP 500 with the error message if generation fails.
- **Configuration:** `OPEN_ROUTER_API_KEY` (optional). When it is absent the feature is silently disabled.
- **Data sent:** the Romanian text fields of the item or group being translated. No user or visitor data is sent.
- **Failure handling:** for content and group translation, errors are logged to stderr and do not affect admin operations. UI string generation surfaces failures to the caller as HTTP 500 (see above).

## Google Fonts (Browser)

`packages/app/index.html` preconnects to `fonts.googleapis.com` / `fonts.gstatic.com` and loads the **Lato** family (weights 300, 400, 700). Visitors' browsers fetch the font directly from Google, so Google receives their IP address and user agent. If Google Fonts is unreachable, the page falls back to system fonts. Self-hosting the font files would remove this third-party request.

## MCP (AI Agent Integration)

There are two independent MCP surfaces. Both expose the same **14** tools, declared once in `packages/shared/src/mcp-tools.ts` (names, descriptions, zod input schemas, `readOnlyHint` annotations; [ADR-024](../decisions/ADR-024-mcp-shared-tool-contract-and-service-layer.md)) and registered from it by both servers: `list_sites`, `list_groups`, `list_media`, `list_cards`, `create_card`, `update_card`, `publish_card`, `upload_media`, plus `get_analytics_overview`, `get_item_stats`, `get_top_items`, `get_short_link_stats`, `create_short_link`, `list_short_links` (FR-080–FR-084). Only card content items can be created or edited. Richtext, Poster and Embedded YouTube Video are not exposed.

| | Local stdio server | Remote endpoint |
|---|---|---|
| Code | `packages/mcp/src/index.ts` (`@betel/mcp`, binary `betel-mcp`) | `packages/api/src/routes/mcp.ts` |
| Transport | stdio, launched as a subprocess by the MCP host (Claude Desktop, Cursor, …) | Streamable HTTP at `/mcp` on the app's origin (POST / GET / DELETE), e.g. for the Claude iOS app |
| Auth | Logs in via `POST /api/auth/login` with `BETEL_EMAIL` / `BETEL_PASSWORD`, caches the 8 h JWT and re-logs in on 401 | `Authorization: Bearer <MCP_SECRET>`, compared in constant time; `POST /mcp` rate-limited to 120/min/IP. The endpoint is disabled when `MCP_SECRET` is unset |
| Data access | HTTP calls to the admin REST API (`BETEL_API_URL`, default `http://localhost:3100/api`); the six analytics/short-link tools return the REST body unchanged | Direct Drizzle access for the card/media tools; the six analytics/short-link tools call `services/analytics-stats.ts` / `services/short-links.ts` |
| Business rules and audit | Enforced by the REST handlers and services. Audit entries are attributed to the configured admin account | Services shared with the REST handlers (analytics, short links, group order); card/media rules still re-implemented. Audit entries are attributed to the synthetic actor `mcp@betel` |
| Decision | [ADR-012](../decisions/ADR-012-mcp-server.md) | [ADR-015](../decisions/ADR-015-remote-mcp-endpoint.md) |

Tool notes:
- `create_card` creates a draft. `publish_card` moves a draft to published. `create_card` / `update_card` write `title`, `description`, `thumbnail`, `startDate`, `endDate` (both `YYYY-MM-DD` calendar days in Romania, rejected otherwise; BR-015), `startTime` (`HH:mm`, single-day events only, BR-035; `null` clears it on `update_card`), `link`, `cta` into the `data` JSONB column, plus top-level `sites[]` and `exclusiveSite`. `groupId` is accepted on create only (neither surface can move an existing card between groups).
- `upload_media` takes base64 `imageData` (without a `data:` prefix), an optional `filename` and an optional `mimeType` (must be `image/*` on both surfaces). The stdio server posts the bytes to `POST /api/admin/media` (default type `image/jpeg`). The remote endpoint processes the image in-process. Both paths check 5 MB and re-encode to WebP (max 1980 px wide, quality 82). `POST /mcp` sets a route-level `bodyLimit` of 8 MiB so a 5 MB image still fits after base64 (about +33 %) and the JSON-RPC envelope; a reverse proxy in front must allow bodies of at least that size for remote uploads.
- Both surfaces return a **relative** `url` (`/uploads/<uuid>.webp`). Pass it as-is as `thumbnail`: `create_card` / `update_card` accept a media library path starting with `/uploads/` or any absolute URL.
- Creating a card with a `groupId` re-sorts the group chronologically (FR-046, BR-013) on both surfaces; the shared logic lives in `packages/api/src/services/group-order.ts`.
- Analytics tools (`get_analytics_overview`, `get_item_stats`, `get_top_items`, `get_short_link_stats`) are read-only and take `from` / `to` (inclusive `YYYY-MM-DD`, default the last 30 days, max 366) and `tz` (IANA name, default `Europe/Bucharest`) — BR-040. The stdio server calls the range endpoints `GET /api/admin/analytics/{range,items/:id/stats,top-items,short-links}` with the tool input as query string. Per-item data is clicks only (no item views are tracked); clicks of a deleted short link count as website clicks.
- `create_short_link(itemId, label, siteSlug?, previewMode?)` (`previewMode`: `content` default, or `destination` to let messaging apps preview the destination page instead of the item; FR-089) returns the absolute `url` (`PUBLIC_BASE_URL` + `/s/<code>`), the current `destination` and a `warning` when the item has no link; it is audit-logged as `short-link.create` (BR-041). `list_short_links` returns `{ shortLinks }` with `url`, `previewMode` and all-time `clickCount`. There is no delete tool (admin UI only).
- Parity: `pnpm --filter @betel/mcp build && pnpm --filter @betel/mcp parity` diffs `tools/list` of both surfaces; add `--calls` (both surfaces on one seeded database) to compare the read tools' parsed responses. Run it before committing changes to either server or to the analytics/short-link services. The stdio package is bundled with esbuild (`dist/index.js`), because it imports the contract as TypeScript from `@betel/shared`.

Credentials (`BETEL_EMAIL` / `BETEL_PASSWORD`, `MCP_SECRET`) are secrets. Never commit them. For the stdio server, use a dedicated admin service account so audit entries are attributable and the account can be revoked independently.

The roadmap's API key layer for machine clients (MCP, Zapier, …) has not been built. Both MCP surfaces use interim auth schemes until it exists.

## Feed Readers and AI Agents (Inbound)

Read-only, public, unauthenticated; no outbound calls ([ADR-021](../decisions/ADR-021-rss-event-feed.md)).

- **Event feeds (RSS 2.0):** `GET /feed.xml` (all-sites view, site-exclusive items omitted as on the hub) and `GET /:siteSlug/feed.xml` (one site). Items are the current and upcoming events (FR-060), in chronological document order, each linking to its item page `/i/<id>`. Optional `?lang=<code>` (an enabled language; Romanian fallback per field). Namespaces: `atom` (self link), `ev` = `http://purl.org/rss/1.0/modules/event/` (`ev:startdate` — a date, or a date-time with the Bucharest offset when the item has a start time — `ev:enddate`, `ev:location`) and `betel` = `urn:betel:feed:1.0` (`startDate`, `startTime`, `endDate`, `site`, `group`, `actionLink`). `actionLink` is the item's resolved link when it is an absolute `http(s)` URL or a `mailto:` / `tel:` link; root-relative paths and other schemes are omitted.
- **Caching:** the body is deterministic, so pollers get `304 Not Modified` with `If-None-Match` until the data or the Bucharest calendar day changes; `Cache-Control: public, max-age=300`, `<ttl>5</ttl>`, 120 requests per minute per IP.
- **Discovery:** `<link rel="alternate" type="application/rss+xml">` on `/` and each `/:siteSlug`; `GET /llms.txt` lists the hub pages, every feed URL, the language codes and the public JSON endpoints; `robots.txt` mentions the feeds as a comment.
- **Not tracked:** feed fetches are not recorded in `analytics_events`; the Fastify request log is the only record.

## Future Considerations
- **CDN (e.g. CloudFront):** possible future delivery path for images and static assets. Avoid hardcoding absolute asset URLs so a CDN migration stays easy.
- **Zapier / automation tools:** depend on the planned API key layer.
- **Email (Resend):** *Planned, no release date, not implemented.* Transactional email would use [Resend](https://resend.com), an HTTPS API chosen over SMTP because the VPS restricts ports 25/587. It is needed for FR-030 (emailing temporary passwords to new admins) and FR-031 (self-service password reset). Implementing it would mean adding the `resend` package to `packages/api`, setting up SPF/DKIM DNS records for the sending domain, and introducing new environment variables (expected: `RESEND_API_KEY`, `EMAIL_FROM`). These variables do not exist yet and are not in `example.env`. Add them to [configuration.md](configuration.md) when the feature is built.
