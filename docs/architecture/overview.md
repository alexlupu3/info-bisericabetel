# Architecture Overview

## System Summary
- Main application type: mobile-first church information hub (PWA) with an admin tool
- Primary users: church members accessing content from QR codes or direct links
- Core subsystems:
  - Public PWA: single-page content hub with per-site filtering and site switching
  - Admin tool: content management, site management, user management, analytics dashboard
  - Backend API: serves content to the PWA and receives admin operations
  - Database: stores all content, site configuration, admin accounts, audit logs, analytics events

## Guiding Architectural Principles
- **No vendor lock-in:** the system must not depend on any specific cloud provider, managed service, or proprietary runtime. It must run on a standard VPS or any comparable Linux host.
- **Database portability:** use an ORM or connector layer that supports multiple relational databases (PostgreSQL, MySQL, etc.). Schema is defined in code; switching engines should require only configuration changes.
- **Maintainability first:** structure the codebase so that upgrading dependencies, adding new content types, or adding new features does not require refactoring the entire application.
- **Extensibility:** new content types and new admin features must be addable in isolation without touching unrelated parts of the system.

## Hosting Direction
- Target: VPS running CapRover. Production is a single Docker container; CapRover manages TLS and its reverse proxy in front of the container.
- Must remain self-hostable without proprietary cloud dependencies. See `deployment.md` for environment-specific details.

## Frontend
- **Unified package (`packages/app`):** a single React application serving both the public PWA and the admin tool. The public hub is a PWA (Progressive Web App) — installable on mobile, fast loading, optimized for QR code / direct link entry. No authentication required. The admin tool is reached at `/admin/*` and is lazy-loaded via `React.lazy` so public users never download admin JS.
- **Code splitting:** `packages/app` is built as a single Vite project but produces a separate lazy chunk for `AdminApp`. This replaces the former constraint requiring separate build artifacts — bundle isolation is now enforced at runtime via dynamic import rather than at the package level. See ADR-005.
- **Admin theme scoping:** admin routes are wrapped in a `<div className="admin-theme">` which sets admin-specific CSS custom properties (dark theme, orange accent) independently of the public PWA design token system. This prevents style leakage between the two surfaces.
- **PWA service worker:** `navigateFallbackDenylist: [/^\/admin/]` is preserved in the Vite PWA plugin config so the service worker does not intercept admin routes and PWA installability is unaffected.
- **Style guide skill:** a `frontend-design` Claude Code skill is present in the project and contains the church's style guide. It must be used when building any public-facing UI to ensure brand consistency.

## Backend
- Fastify (Node.js). In production, the Fastify process is the only runtime: it serves the frontend SPA from `dist/public/`, uploaded media from the `UPLOADS_DIR` volume, and all API routes under the `/api` prefix. The short-link redirect route (`GET /s/:code`) is registered before the SPA static-serving handler so that short link codes are not intercepted by the SPA fallback. A `setNotFoundHandler` SPA fallback returns `index.html` for all other unmatched non-`/api` routes. No nginx layer at runtime.
- Must be portable and integrate cleanly with a relational database via an ORM/connector layer.

## Database
- Relational database via schema-driven ORM or connector (PostgreSQL or MySQL preferred, others supported).
- Schema defined in code; migrations managed explicitly.
- A `media` table tracks all uploaded image files (id, url, filename, original_name, size, mime_type, created_at). It is the authoritative record of uploads; usage detection is done by querying JSONB fields on `content_items` rather than via foreign keys (see ADR-003).
- An `analytics_events` table records all site visit and link click events (id, event_type, site_slug, item_id, url, occurred_at). Indexed on `(event_type, occurred_at)` and `(site_slug, occurred_at)` for efficient aggregation queries, and a partial index on `(item_id, occurred_at)` (migration `0006_analytics_item_idx.sql`) for per-item daily-clicks queries. Events are written asynchronously — the ingest endpoint responds 204 immediately. `item_id` is a soft reference (no FK) — analytics events survive content item deletion.
- Migration `0007_soft_delete.sql` adds a partial index on `content_items` where `state = 'deleted'` for efficient Archive page queries. The `state` column on `content_items` supports four values: `draft`, `published`, `archived`, `deleted`.
- Migration `0008_exclusive_site.sql` adds a nullable `exclusive_site TEXT REFERENCES sites(slug)` column on `content_items`, plus a partial index on `(exclusive_site) WHERE exclusive_site IS NOT NULL` for efficient site-specific queries. When set, the value gates the item to that site only — the item is hidden from the all-sites API response. See ADR-009.
- Migration `0009_i18n.sql` adds four tables for internationalization: `languages` (supported locales, seeded with Romanian default and English), `ui_translations` (translated public UI strings keyed by locale and dot-notation key), `content_translations` (per-field translated text for content items), and `group_translations` (translated group names). When the requested locale is the default (`ro`), no translation join is performed — zero query overhead for Romanian users.
- Migration `0010_short_links.sql` adds the `short_links` table (`id` UUID PK, `content_item_id` FK → `content_items` with ON DELETE CASCADE, `code` TEXT UNIQUE, `label` TEXT, `site_slug` TEXT nullable, `created_at`) and a nullable `short_link_id UUID` column on `analytics_events`. `short_link_id` is a soft reference (no FK constraint) — analytics events are preserved even when a short link is later deleted. The `short_links` table uses a cascade-delete FK so that permanently hard-deleting a content item removes its short links.

## File Storage
- Uploaded images are written to a local `uploads/` directory on the server.
- Image URLs are immutable after upload — changing a URL would silently break all `content_items` that reference it.
- Files without a corresponding `media` row are orphans (possible only in the narrow window between a successful disk write and a failed DB insert).

## Key Risks
- Risk: unclear distinction between site-specific and church-wide content could confuse users
- Risk: QR-code and direct-link entry points require careful routing and default filter behavior
- Risk: Sunday morning traffic spikes (thousands of users) require the stack to handle concurrency well without expensive infrastructure
- Risk: extensible content type system must be designed upfront to avoid structural rewrites when new types are added
