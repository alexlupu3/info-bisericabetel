# Product Requirements

Status tags: **[Implemented]**, **[Partially implemented]**, **[Planned]**, **[Not implemented]** (was specified, never built, not currently scheduled), **[Superseded by …]**.

Domain rules (content state machine, expiry, site scoping, short-link behaviour, duplication) live in `docs/domain/` — `content-model.md`, `entities.md`, and `business-rules.md` are the single source for them. Requirements below state *what* must be true and link to the domain docs for the detailed rules.

All API paths are served under the `/api` prefix (e.g. `POST /api/events`), except the short-link redirect `GET /s/:code` and the remote MCP endpoint `/mcp`. All admin UI routes live under `/admin/*`.

## Functional Requirements

### Public Hub
- FR-001: The public-facing hub is a single scrollable page. Content is displayed in the exact order defined by admins, at both root level and within groups. Groups show their title with their items rendered beneath them. **[Implemented]**
- FR-002: The public hub is a PWA (Progressive Web App) — installable on mobile, no authentication required. **[Implemented]**
- FR-003: Each church site has its own direct link (`/<siteSlug>`) that pre-filters the hub to that site's content; QR codes point to these links (QR images are generated outside the app). Users can switch to an all-sites view at any time. **[Implemented]**
- FR-004: A subtle inline link allows users to switch views. When on a site-specific view the link switches to all-sites ("view all"). When on the all-sites view the link ("view site...") opens a popup listing all available sites. **[Implemented]**
- FR-005: The app must persist the user's last selected site preference locally (localStorage key `betel-site`). On return visits without a site URL, the remembered preference is loaded. A URL-encoded site always takes precedence over the stored preference. **[Implemented]**

### Content Model
- FR-006: The system must support four base content types: Card, Richtext, Poster, and Embedded YouTube Video (see `docs/domain/content-model.md` for fields). **[Implemented]**
- FR-007: Cards and Posters may be grouped into Groups. Only one level of nesting is allowed — no groups inside groups. **[Implemented]**
- FR-008: All content items and groups must support site scoping (visible on one site, multiple sites, or all sites). Site scoping only shows or hides items — it never changes their order. Items with `exclusive_site` set are hidden from the all-sites view (FR-036). **[Implemented]** for content items. Groups store a site scope that can be set at creation and edited later **[Implemented]**, but the public content API (`GET /api/content`) does not yet apply group scope, so the group-precedence rule BR-005 is **[Not implemented]** — items in a site-scoped group are filtered only by their own scope. Rules: `docs/domain/content-model.md` — "Ordering and Site Scoping", "Compound Site Scope", "Exclusive Site Scope".
- FR-009: All content items and groups must support manual ordering via drag and drop. Admins manage a single global ordered list and can move any item to any position, including between groups (multi-container drag and drop with a `DragOverlay` ghost). Root-level order is persisted via `PUT /api/admin/content/root-order` (accepts both standalone items and groups); within-group order via `PUT /api/admin/content/order`. When an item moves between containers, its `groupId` is updated. **[Implemented]**
- FR-010: All content types support automatic expiry, via the JSONB `data.startDate` / `data.endDate` fields and the independent `expiresAt` column; either alone is sufficient to hide an item from the public hub. The admin form uses progressive disclosure — end date is hidden until a start date is set. **[Implemented — migration `0005_migrate_card_date.sql` promoted legacy `data.date` → `data.startDate` on existing cards]** Rules: `docs/domain/content-model.md` — "Expiration Behavior".
- FR-011: The content type system must be extensible — new types must be addable without restructuring the existing system. **[Implemented]** See `docs/domain/content-model.md` — "Extensibility Note".
- FR-036: The system must support site-exclusive content items: an item marked exclusive to one site is hidden from the all-sites view and visible only when that site is selected. Admins configure this via the "Exclusiv unei locații" checkbox in the content form (switches the site selector to a mandatory single-site radio); exclusive items are marked with a Lock icon in the admin list. Groups do not support exclusive mode. **[Implemented — migration `0008_exclusive_site.sql`; see BR-006, BR-007, BR-008, ADR-009]** Rules: `docs/domain/content-model.md` — "Exclusive Site Scope".
- FR-032: Cards and Posters must support per-site link overrides: one item can show a different link URL depending on the active site view, falling back to the default link. Only the URL is overridable. The admin form exposes a collapsible "Link-uri per locație" section below the link field when a default link is set. **[Implemented — ADR-007]** Rules: `docs/domain/content-model.md` — "Link Resolution Rule".

### Publishing
- FR-012: Every content item must have one of four publishing states: `draft`, `published`, `archived`, or `deleted`. **[Implemented]** State machine: `docs/domain/content-model.md` — "Publishing state" / "State transitions".
- FR-013: Only `published` items are visible on the public hub. `deleted` items are additionally excluded from the admin Content page and are only accessible from the Archive page (`/admin/archive`). **[Implemented]**
- FR-014: When an item's expiry date passes, it must disappear from the public hub automatically. **[Implemented]** — expired items are filtered out at query time; their publishing state is **not** changed (they stay `published`). Automatically transitioning expired items to `archived` **[Planned]** — not built; today `archived` is only set by the manual "Ascunde" (Hide) action (`POST /api/admin/content/:id/archive`).

### Admin Tool — Content Management
- FR-015: ~~The admin tool is a separate web application from the public PWA, with its own entry point, login, and independent build bundles.~~ **[Superseded by ADR-005]** The admin tool lives in the same `packages/app` package as the public hub. Admin routes (`/admin/*`) are lazy-loaded into a separate Vite chunk, so public visitors never download admin code; the admin has its own login screen.
- FR-016: Archived items remain listed on the admin Content page, rendered with a muted state indicator. **[Implemented]** A filter that hides archived items from the default list **[Not implemented]**. Deleted items are not shown on the Content page at all — only on the Archive page (`/admin/archive`). **[Implemented]**
- FR-033: The admin tool must support soft-delete for content items. The "Șterge" (Delete) action sets the item's state to `deleted` rather than removing the row. **[Implemented — migration `0007_soft_delete.sql`; partial DB index on `state = 'deleted'`]**
- FR-034: The admin tool must provide an Archive page at `/admin/archive` listing all soft-deleted content items, each with "Restaurează" (restore to `draft`, clears `groupId`) and "Șterge definitiv" (permanent hard delete). **[Implemented]**
- FR-035: Deleting a Group must soft-delete all its child content items (state → `deleted`, `groupId` cleared) before hard-deleting the group row, so no content is lost without admin awareness. Audit action: `group.delete`. **[Implemented]**
- FR-017: Images must be uploaded directly to the server. A media library allows admins to browse and reuse previously uploaded images. Every upload is recorded in the `media` table. The admin Media page (`/admin/media`) provides a gallery with filter tabs (all / in use / not in use), per-image usage attribution, and a delete action for unused images; delete is blocked server-side (HTTP 409) while the image is referenced. **[Implemented — ADR-003]** Upload limits and processing: `docs/domain/content-model.md` — "Image Handling".
- FR-028: Poster content items must support an optional admin-only `name` field (`data.name`, never shown publicly) used to identify the item in the media library usage view. **[Implemented]**
- FR-018: The admin tool must provide a preview mode that renders the public hub view (including draft items) for a selected site. **[Not implemented]** — no preview route or API exists.
- FR-026: Group management is fully integrated into the Content page (there is no separate Groups page in the navigation — ADR-002). **[Implemented]**
  - Groups are visual container sections with a header showing the title, assigned sites (text hint when set), and action buttons. Items without a group appear in a "Fără grup" section.
  - "+ Grup nou" creates a group inline (title + site-scope checkboxes; empty = all sites).
  - "Editează" on a group header (or clicking the group title) opens an inline edit panel; saving issues `PATCH /api/admin/groups/:id`.
  - "Șterge grup" applies FR-035.
  - Clicking a content item's name opens its inline edit form (same as the "Editează" menu action).
- FR-027: The content create/edit form retains a group dropdown selector as a convenience field, allowing an admin to assign or reassign an item's group while editing it. **[Implemented]**
- FR-029: Each group on the Content page must be individually collapsible via a chevron toggle. A collapsed group cannot receive dropped items but can still be reordered by its drag handle. A "toggle all groups" header button (shown only when at least one group exists) collapses all groups, or expands all if all are collapsed. Collapse state is session-local. **[Implemented]**
- FR-046: Each group on the admin Content page must provide a "Sortează cronologic" (Sort chronologically) button that reorders the group's items by `data.startDate`, and a newly created item inside a group must trigger the same re-sort. Manual drag-and-drop remains available. **[Implemented — 2026-05-13, with a known gap]** Sort rules: [BR-013](../domain/business-rules.md). Known gap: on create, equal-`startDate` ties are not guaranteed to keep the existing display order (see BR-013 → enforcement gap).
- FR-042: The admin tool must support duplicating any content item via a "Duplică" option in the item's context menu. Backend: `POST /api/admin/content/:id/duplicate` (auth required, HTTP 201). Auto-translation is triggered for the duplicate when `OPEN_ROUTER_API_KEY` is set. Audit action: `content.duplicate` with `detail.sourceId` and `detail.type`. **[Implemented — 2026-05-02]** Copy rules: BR-009, BR-010 and `docs/domain/content-model.md` — "Duplication".

### Admin Tool — Site & Account Management
- FR-019: Only the super-admin can manage church sites. Sites must not be hardcoded in application code. Each site has a configurable accent color used to theme its public hub view; the all-sites view uses a neutral default theme. **[Partially implemented]** — the super-admin can edit a site's name, accent color, and address on the Locations page (`/admin/locations`, `PATCH /api/admin/sites/:slug`). Creating new sites through the UI/API is **[Not implemented]**: the current sites are seeded by migration `0000_initial.sql`.
- FR-020: The first `super-admin` account is created through `POST /api/setup`, which only works while the `users` table is empty (HTTP 409 afterwards). The super-admin must be able to create admin accounts by providing an email address (and role). The server generates a temporary password and returns it once for out-of-band delivery. **[Implemented]** Email delivery of the temporary password: FR-030.
- FR-021: Admins must be prompted to change their password on first login (`must_change_password` flag). **[Implemented]** — enforced client-side only: the flag is carried in the login response/JWT and the admin app shows the change-password screen; the API does not block other admin endpoints while the flag is set.
- FR-022: The super-admin must be able to trigger a password reset for any `admin`-role account. **[Implemented]** `POST /api/admin/users/:id/reset-password` generates a temporary password (16 hex characters), hashes it with bcryptjs (cost 12), sets `must_change_password = true`, and returns `{ tempPassword }` once. Super-admin accounts cannot be reset this way. Audit: `action: 'reset_password'`, `entityType: 'user'`, `detail.targetEmail`. The Users page shows a "Resetează parola" button per eligible row. Self-service reset: FR-031.
- FR-030: When a super-admin creates a new admin account, the system must email the temporary password to the new user instead of displaying it in the admin UI. Requires email service integration (see `docs/architecture/integrations.md`). **[Planned — no release date]**
- FR-031: The system must support a self-service password reset flow: a "Forgot password" link on the admin login page sends an email with a time-limited reset link that opens a "Reset password" page. Backend: new `password_reset_tokens` table (`id`, `userId`, `token`, `expiresAt`) and `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`. Requires email service integration. **[Planned — no release date]**

### Internationalization (i18n)
See ADR-014 (i18n strategy) and ADR-010 (AI auto-translation).
- FR-047: The public hub must support multiple display languages. Romanian (`ro`) is the default and always available. Additional languages are managed by a super-admin and can be enabled or disabled at any time. **[Implemented — 2026-04-19]**
- FR-037: The user's language preference must be persisted locally (localStorage key `betel-lang`). URLs are not localized — the same URL works for all languages. **[Implemented]**
- FR-038: All public UI strings must be managed via a translation key system. `LanguageContext` provides a `t()` function and `useLanguage()` hook; a `LanguageSwitcher` toggle is displayed in the public hub footer. **[Implemented]**
- FR-039: Content items and group titles must support per-language translations with transparent fallback to Romanian. Links and dates are not translatable. Poster (`imageUrl`) and Card (`thumbnail`) support locale-specific image overrides. **[Implemented — locale images added 2026-04-21]** Rules: `docs/domain/content-model.md` — "Shared Metadata" → Locale; `docs/domain/entities.md` — ContentTranslation.
- FR-040: The API must serve translations efficiently: no extra translation query for the default locale; for other locales, translation rows are joined and merged before returning content. **[Implemented]**
- FR-041: The admin tool must provide a Translations page (`/admin/translations`, super-admin only) with language management (add / enable / disable / delete) and a UI-string translation editor. Content translations are edited via a language dropdown in the content edit form (text fields for all types; image pickers "Imagine (per limbă)" / "Miniatură (per limbă)" for Poster / Card). Translation status badges mark items with missing or incomplete translations. **[Implemented — image pickers added 2026-04-21]**

### Audit & Analytics
- FR-023: The system must maintain an audit log recording who changed what and when for all content and configuration changes. **[Partially implemented]** Actions currently recorded: `content.create`, `content.update`, `content.publish`, `content.archive`, `content.delete`, `content.restore`, `content.permanent-delete`, `content.duplicate`, `content.translation.upsert`, `content.translation.delete`, `group.delete`, `group.translation.upsert`, `group.translation.delete`, `language.create`, `language.update`, `language.delete`, `translation.bulk-upsert`, `translation.ai-generate`, `reset_password`, and `media.upload` (remote MCP endpoint only). Not yet audited: group create/update/reorder, content reordering, admin user create/delete, site edits, short link create/delete, and media upload/delete through the admin UI.
- FR-024: The system must track site visits and link clicks, recording which church site the event originated from. **[Implemented]** Events are ingested via `POST /api/events` (public, no auth, rate-limited to 60/min per IP) and written fire-and-forget. The public app tracks site visits in `HomePage.tsx` (deduplicated per 30-minute window via localStorage key `betel-track-visit-{site}`, `all` for the all-sites view) and link clicks in the `CardItem.tsx` and `PosterItem.tsx` onClick handlers; all tracking goes through `packages/app/src/public/api/track.ts`. When a Card or Poster has a link, the whole `<article>` is wrapped in an `<a>` so the entire surface is clickable; a Card's inner CTA is rendered as a styled `<span>` (no nested `<a>`). Entity: `docs/domain/entities.md` — AnalyticsEvent.
- FR-025: The admin analytics dashboard must provide reporting for site visits and link clicks. **[Implemented — rebuilt 2026-04-19; tooltip breakdown 2026-05-02; custom start date 2026-05-04; short link columns 2026-05-06; ADR-008]** The dashboard at `/admin/analytics`:
  - **Time-frame selector:** day / week / month; current-period totals are compared with the previous equivalent period (percentage change).
  - **Custom start date picker:** a "De la" date picker selects a start date (max = today); charts then show daily data from that date to today, compared with the same-length window before it. Selecting a date deactivates the presets; clicking a preset clears the date.
  - **Stat cards:** Views and Clicks, each with current total and ± % change; clicking a card switches the charted metric.
  - **Trend chart:** Recharts dual-line chart (current period solid, previous period dashed). For Clicks, the tooltip lists up to 10 links clicked in that bucket plus a "+ N alte linkuri" residual count.
  - **Content clicks table:** items sorted by total clicks with Website clicks, Short link clicks, and Total columns. A row opens a modal with a 90-day daily stacked area chart (website + one layer per short link); a Download button exports CSV (FR-043).
  - **API endpoints:** `GET /api/admin/analytics/overview?period=day|week|month[&startDate=YYYY-MM-DD]` (response includes `clickBreakdown` and `otherClicks` per current-period bucket; `period: 'custom'` when `startDate` is given); `GET /api/admin/analytics/sites-comparison`; `GET /api/admin/analytics/items`; `GET /api/admin/analytics/items/:itemId/daily`; `GET /api/admin/analytics/items/:itemId/export`. Legacy endpoints `/api/admin/analytics/lifetime` and `/api/admin/analytics/daily` remain for backward compatibility. `overview`, `items`, and `items/:itemId/daily` accept an optional `?site=` filter.
  - **Frontend:** `packages/app/src/admin/components/analytics/` (StatCard, TrendChart, PeriodSelector, SiteFilter, ItemsTable, ItemDailyModal, SitesComparisonChart, plus `index.ts`).
  - **Database:** migration `0006_analytics_item_idx.sql` adds an index on `(item_id, occurred_at)`.
- FR-043: Admins must be able to export raw click data for a specific content item as CSV. **[Implemented — 2026-05-03; short link columns 2026-05-06]**
  - **Endpoint:** `GET /api/admin/analytics/items/:itemId/export?site=<slug>` (admin Bearer token). Returns all historical `link_click` events for the item — intentionally no time-range filter (may be revisited if files grow too large).
  - **CSV columns:** Timestamp, Site, Titlu (item title), URL, Sursa ("website" or the short link label), Cod link scurt (short link code, if any).
  - **Site scoping:** the optional `site` parameter (from the active `SiteFilter`) limits the export to one site.
  - **Download:** `downloadFile()` in `packages/app/src/admin/api/client.ts` fetches with the Bearer header and saves the blob via a temporary object URL. Clicking Download does not open the item drill-down modal.
  - CSV is serialized manually; no CSV library dependency.
- FR-044: The system must support short link tracking for content items, so admins can compare traffic across distribution channels (e.g. "WhatsApp Manastur", "QR cod intrare") for the same content. **[Implemented — 2026-05-06; ADR-011]**
  - Short links are created on demand by admins only; each has a server-generated 6-character code and a channel label.
  - Public redirect: `GET /s/:code` logs the click server-side and redirects to the dynamically resolved destination. Website click tracking (FR-024) is unchanged.
  - **Admin endpoints:** `GET /api/admin/content/:id/short-links` (with click counts), `POST /api/admin/content/:id/short-links`, `DELETE /api/admin/content/:id/short-links/:shortLinkId`.
  - **Admin UI:** the content editor has "Editează" and "Link-uri scurte" tabs; `packages/app/src/admin/components/content/ShortLinksTab.tsx`.
  - **Database:** migration `0010_short_links.sql` (`short_links` table; nullable `short_link_id` on `analytics_events` with an `ON DELETE SET NULL` foreign key, so click events survive short link deletion).
  - Resolution, fallback, and cascade rules: BR-011, BR-012 and `docs/domain/entities.md` — ShortLink.
- FR-045: The system must capture and expose frontend application errors to super-admins. **[Implemented — 2026-05-11]**
  - **Ingest:** the public app wraps its React tree in an ErrorBoundary that calls `POST /api/errors` (no auth; rate-limited to 20/min per IP) with `{ message, stack, url, site, device }`. The server responds 204 and inserts asynchronously into `error_logs` (message capped at 2 000 chars, stack at 10 000).
  - **Viewer:** `GET /api/admin/error-logs` (super-admin only), paginated (default `limit=50`, max 200), newest first, optional `site` filter.
  - **Admin UI:** `/admin/error-logs` ("Erori" nav link, super-admin only): table of date/time, site, URL, message, stack, device; long cells expand inline; site filter and prev/next pagination.
  - **Database:** `error_logs` — `id` (UUID PK), `message` (TEXT NOT NULL), `stack`, `url`, `site_slug` (nullable), `device` (JSONB, default `{}`), `occurred_at` (TIMESTAMPTZ); indexes on `occurred_at` and `(site_slug, occurred_at)`. Records are never deleted.

### MCP Content Creation
- FR-048: The system must expose an MCP (Model Context Protocol) server that allows an AI agent to create and manage card content via a chat interface. **[Implemented — 2026-05-13; updated 2026-05-14]** Two transports expose the same 8 tools — `list_sites`, `list_groups`, `list_media`, `list_cards`, `create_card`, `update_card`, `publish_card`, `upload_media`:
  - **Local stdio server** — `packages/mcp/` (`@betel/mcp`). Authenticates against the admin REST API with `BETEL_EMAIL` / `BETEL_PASSWORD` (optional `BETEL_API_URL`); all writes go through the REST API, so audit logging (FR-023) and business rules apply. See ADR-012.
  - **Remote endpoint** — `POST|GET|DELETE /mcp` served by the API (`packages/api/src/routes/mcp.ts`), protected by `Authorization: Bearer <MCP_SECRET>`. Writes go directly to the database and are audit-logged with an MCP actor. See ADR-015.
  - `create_card` creates items in `draft`; `publish_card` publishes them. `upload_media` accepts a base64 image and returns a media row with a relative URL (`/uploads/<uuid>.webp`); because the `thumbnail` field requires an absolute URL, the caller must prefix the public origin before using it as a card `thumbnail` (known issue, see `docs/architecture/integrations.md` → MCP). Only card content items are exposed in this iteration. Configuration: `docs/architecture/configuration.md`; integration details: `docs/architecture/integrations.md`.

## Non-Functional Requirements
- NFR-001: Both the public hub and the admin tool must be optimized for mobile-first access.
- NFR-002: The application must minimize friction for first-time visitors opening a shared link or scanned QR code.
- NFR-003: The information architecture must stay clear even when content spans multiple church sites.
- NFR-004: ~~No translation or i18n system is required.~~ **[Superseded — i18n implemented 2026-04-19]** The public hub supports multiple languages; Romanian is the default and additional languages (initially English) can be enabled by a super-admin. The admin interface itself remains Romanian-only. See FR-047, FR-037–FR-041 and ADR-014.
- NFR-005: The system must handle traffic spikes on Sunday mornings (thousands of concurrent users). Baseline weekday traffic is in the hundreds. Sunday morning is the critical availability window.
- NFR-006: The public hub must load fast on mobile devices including on slower connections. Performance optimization (minimal bundle size, efficient image loading, caching) is a first-class concern.
- NFR-007: No formal WCAG compliance level required, but the app must follow healthy HTML5 standards (semantic markup, meaningful alt text, logical heading structure).
- NFR-008: No vendor lock-in: the system must run on a standard Linux VPS without proprietary dependencies. ~~Database must be swappable via ORM/connector configuration.~~ **[Database portability superseded by ADR-016]** The system targets PostgreSQL only — it relies on raw SQL migrations, JSONB columns, PostgreSQL array types, Drizzle `pgTable` schemas, and the `postgres` (postgres-js) driver. PostgreSQL is open source and self-hostable, so the no-lock-in goal still holds.
- NFR-009: The codebase must be structured for long-term maintainability — dependency upgrades and new features must not require full-app refactors.

## Roles
- **Church member / attendee:** read-only access to the public hub
- **Admin** (role `admin`): authenticated; can create, edit, publish, and archive any content item on any site
- **Super-admin** (role `super-admin`): all admin capabilities plus site management, admin account creation, password resets, languages/translations, and the error log viewer

## Acceptance Notes
- What must be true for launch?
  - Members can open the app from QR codes or direct links
  - Members can see content, filter by site, and view all content
  - Admins can manage content with full draft/publish/archive workflow
  - Super-admin can manage sites and admin accounts
  - Audit log and analytics dashboard are operational
- What can wait for later phases?
  - Profile-based views (youth, family, elderly, leaders) — **deferred indefinitely**. The existing Audiences plan is kept as reference material, but the approach of separate public pages is considered unsuitable for the current experience. Any revival must propose a solution integrated into the single hub, without a separate destination users would have to discover. See `docs/product/roadmap.md`.
  - MCP server — Phase 2 [done — 2026-05-13]
  - External API key layer (Zapier, full integration) — Phase 2 [pending]
  - In-app form builder — Phase 3
  - Push notifications — Phase 3
