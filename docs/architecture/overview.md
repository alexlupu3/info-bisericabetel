# Architecture Overview

For the package-by-package code map, commands and conventions see [`AGENTS.md`](../../AGENTS.md). This page describes the runtime architecture and the principles behind it.

## System Summary
- Main application type: mobile-first church information hub (PWA) with an admin tool.
- Primary users: church members arriving from QR codes, short links or direct links; a small team of admins and super-admins.
- Core subsystems:
  - **Public hub** (`/`, `/:siteSlug`): single-page content hub with per-site filtering, site switching and multiple display languages. No authentication.
  - **Admin tool** (`/admin/*`): content, groups, media, short links, sites, users, translations, analytics, audit and error logs. Romanian-only UI.
  - **Backend API** (`/api/*`): Fastify 5 + Drizzle ORM on PostgreSQL. Serves the hub and the admin tool.
  - **Two MCP surfaces** for AI agents (see `integrations.md`):
    - `packages/mcp`: a local stdio server that calls the REST API ([ADR-012](../decisions/ADR-012-mcp-server.md)).
    - `/mcp`: a remote Streamable HTTP endpoint inside the API process that accesses the database directly ([ADR-015](../decisions/ADR-015-remote-mcp-endpoint.md)).
  - **Database:** PostgreSQL holds all content, site configuration, languages and translations, admin accounts, audit log, analytics events, short links and frontend error logs.

## Runtime Topology

```
CapRover nginx (TLS) ──► single container: node dist/index.js (Fastify, PORT=80)
                           ├─ /api/*        REST API
                           ├─ /mcp          remote MCP (only when MCP_SECRET is set)
                           ├─ /s/:code      short-link redirect
                           ├─ /feed.xml, /:siteSlug/feed.xml   RSS 2.0 current and upcoming events (ADR-021)
                           ├─ /llms.txt    agent-oriented index of pages, feeds and public API
                           ├─ /uploads/*    uploaded media from the UPLOADS_DIR volume
                           ├─ /health       health check
                           ├─ /robots.txt, /sitemap.xml   crawler endpoints (ADR-022)
                           ├─ /, /:siteSlug, /i/:itemId → server-rendered head + content snapshot into the SPA shell
                           └─ everything else → built SPA (dist/public), index.html fallback
                         ──► PostgreSQL (separate CapRover app / compose service)
```

- One container, one process ([ADR-006](../decisions/ADR-006-single-container-deployment.md)). There is no nginx inside the container. CapRover's reverse proxy terminates TLS in front of it.
- Inside the container the API listens on port 80 (`PORT=80` in the `Dockerfile`). Locally the API defaults to port 3100. The local staging compose file maps host `${STAGING_APP_PORT:-8080}` to container port 80 ([deployment.md](deployment.md#environments)).
- Migrations in `packages/api/src/db/migrations/` are applied automatically at API startup.
- Optional outbound calls: OpenRouter for AI translation (server side) and Google Fonts (browser side). See `integrations.md`.
- Environment variables are documented in [configuration.md](configuration.md). Deployment steps are in [deployment.md](deployment.md).

## Guiding Architectural Principles
- **No vendor lock-in:** the system must not depend on any specific cloud provider, managed service, or proprietary runtime. It must run on a standard VPS or any comparable Linux host.
- **PostgreSQL only:** the database is PostgreSQL, and its specific features (JSONB, partial indexes, advisory locks, time-zone arithmetic) are used deliberately. Database portability is no longer a goal ([ADR-016](../decisions/ADR-016-postgresql-only.md)).
- **Maintainability first:** structure the codebase so that upgrading dependencies, adding new content types, or adding new features does not require refactoring the entire application.
- **Extensibility:** new content types and new admin features must be addable in isolation without touching unrelated parts of the system.

## Frontend
- **Unified package (`packages/app`):** a single React + Vite application serving both the public hub and the admin tool. The public hub is an installable PWA, optimized for QR code and direct-link entry. The admin tool lives at `/admin/*` and is lazy-loaded via `React.lazy`, so public users never download admin JS ([ADR-005](../decisions/ADR-005-merge-pwa-admin-into-app.md)).
- **Admin theme scoping:** admin routes are wrapped in `<div className="admin-theme">`, which sets admin-specific CSS custom properties independently of the public design tokens.
- **PWA service worker:** `registerType: 'autoUpdate'`. Admin routes, short links (`/s/*`), `/robots.txt`, `/sitemap.xml`, the event feeds (`/feed.xml`, `/*/feed.xml`) and `/llms.txt` are excluded from the navigation fallback; `/`, `/:siteSlug` and `/i/:itemId` are not (installed apps get the precached shell and fetch data). Caching headers are described in [ADR-013](../decisions/ADR-013-http-cache-strategy.md).
- **SEO:** the API injects page metadata, JSON-LD and a static HTML snapshot of the feed into `index.html` for public pages; the SPA seeds its data from the inline JSON and replaces the snapshot on mount ([ADR-022](../decisions/ADR-022-server-side-head-injection-and-content-snapshot.md)). Titles and SEO text rules are shared through `packages/shared/src/seo.ts`; absolute URLs come from `PUBLIC_BASE_URL` (`services/public-url.ts`).
- **i18n:** public UI strings and content translations are served by the API. The locale preference is stored in `localStorage` and URLs are not localized ([ADR-014](../decisions/ADR-014-i18n-strategy.md)).
- **Style guide:** the `frontend-design` skill (`.agents/skills/frontend-design/`) contains the church's style guide and must be used for any UI work in `packages/app` (public hub and admin).

## Backend
- Fastify 5 (Node.js), bundled with esbuild. In production the Fastify process is the only runtime. All REST routes are registered under the `/api` prefix. The short-link route (`GET /s/:code`) is registered before the SPA static handler so codes are not swallowed by the SPA fallback. A `setNotFoundHandler` returns `index.html` (with `Cache-Control: no-cache`) for unmatched non-`/api` paths and a JSON 404 for unmatched `/api` paths.
- The event feed and `/llms.txt` routes (`routes/feed.ts`, `routes/llms-txt.ts`) are registered before the SPA static handler, like the short-link route, and share the public content selection with `GET /api/content` (`services/public-content.ts`); the RSS serializer (`services/rss.ts`) is a pure, deterministic function so the strong `ETag` changes only with the data ([ADR-021](../decisions/ADR-021-rss-event-feed.md)).
- Drizzle ORM over `postgres` (postgres-js). Raw SQL through Drizzle's `sql` tag is used where needed.
- Background work (AI translation) runs in-process as fire-and-forget `setImmediate` jobs ([ADR-010](../decisions/ADR-010-ai-auto-translation-fire-and-forget.md)). There is no queue.

## Database
- PostgreSQL. The schema is defined in `packages/api/src/db/schema.ts`. Migrations are hand-written SQL files applied in order by `db/migrate.ts` and tracked in a `_migrations` table.
- Notable design choices (details live in the ADRs and in `docs/domain/`):
  - Content type-specific fields live in a JSONB `data` column. Per-site link overrides are in `data.siteLinks` ([ADR-007](../decisions/ADR-007-per-site-link-overrides-client-side-resolution.md)).
  - The `media` table is the authoritative record of uploads. Usage is detected by scanning JSONB fields on `content_items` and `content_translations` rather than through foreign keys ([ADR-003](../decisions/ADR-003-image-library-management.md)).
  - `content_items.exclusive_site` gates an item to one site ([ADR-009](../decisions/ADR-009-site-exclusive-content-dedicated-column.md)). `state` takes the values `draft`, `published`, `archived` or `deleted` (soft delete).
  - `languages`, `ui_translations`, `content_translations` and `group_translations` hold i18n data. No translation join is performed for the default locale (`ro`).
  - `short_links` reference a content item and resolve the destination at redirect time ([ADR-011](../decisions/ADR-011-short-link-dynamic-url-resolution.md)).
  - `error_logs` is append-only. `analytics_events` is append-only except that permanently deleting a content item also deletes its events (see [content-model.md](../domain/content-model.md)). `analytics_events.item_id` is a soft reference (no foreign key), so events survive soft deletion of the item; `short_link_id` has an `ON DELETE SET NULL` foreign key, so events survive deletion of a short link. Both ingest endpoints (`POST /api/events`, `POST /api/errors`) respond 204 immediately and are rate-limited per IP.
  - `audit_log` records admin writes (see `security.md` for coverage).

## File Storage
- Uploaded images are re-encoded to WebP and written to `UPLOADS_DIR`, which must be a persistent volume in production. Fastify serves them at `/uploads/*`.
- Image URLs are immutable after upload. Changing a URL would silently break every item that references it.
- Files without a corresponding `media` row are orphans. This is possible only in the narrow window between a successful disk write and a failed DB insert.

## Development and Testing
- `pnpm dev` runs the Vite dev server on `:5173`; `pnpm dev:api` runs the API on `:3100`. The Vite proxy forwards `/api`, `/uploads`, `/s/`, `/robots.txt`, `/sitemap.xml`, `/feed.xml`, `/:siteSlug/feed.xml` and `/llms.txt` to the API, so media, short links, crawler endpoints and feeds all work on `:5173`. A production-like run is available through local staging ([deployment.md](deployment.md#environments)).
- E2E tests use Cypress (`cypress/e2e/`). Every spec stubs the API with `cy.intercept`, so the suite exercises the frontend against fixtures and does not cover the API or database.
- There is no CI pipeline in the repository. Lint, type-check and tests are run locally before merging.

## Key Risks
- Unclear distinction between site-specific and church-wide content could confuse users.
- QR-code and direct-link entry points require careful routing and default filter behavior.
- Sunday morning traffic spikes (thousands of users) require the stack to handle concurrency well without expensive infrastructure.
- The extensible content type system must stay generic to avoid structural rewrites when new types are added.
- Two MCP implementations duplicate the card/media business rules and can drift apart ([ADR-015](../decisions/ADR-015-remote-mcp-endpoint.md)); tool schemas are shared and the analytics/short-link tools use shared services ([ADR-024](../decisions/ADR-024-mcp-shared-tool-contract-and-service-layer.md)).
- Security gaps tracked in `security.md`: permissive CORS, no login rate limiting, and incomplete audit coverage.
