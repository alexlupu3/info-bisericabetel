# Domain Entities

One section per domain entity: purpose, key attributes, relationships, lifecycle, and validation rules. Behavioural rules (state machine, expiry, site scoping, image handling) are defined once in `content-model.md` and `business-rules.md`; this file links to them. Table definitions live in `packages/api/src/db/schema.ts` and `packages/api/src/db/migrations/`.

## Entities
### Site
- Purpose: represent one local campus or location within the church
- Key attributes: slug (stable unique identifier), name (display label), accent color (used for site-specific branding on the public hub), address, and other operator-defined info fields; structured address (`street_address`, `postal_code`, `address_locality`, `address_region`, `address_country`), `latitude`/`longitude`, `telephone`, `email` (migration `0013_site_address_fields.sql`, all optional) — used for the site's schema.org `Church` markup and shown in the public footer; the free-text `address` remains the display label when no structured street/locality is set
- Relationships: used for site scoping on Groups and Content Items (`sites[]`, `exclusive_site`); referenced by ShortLink (`site_slug`), AnalyticsEvent and error logs (`site_slug`)
- Lifecycle: stored in the `sites` table, never hardcoded in application code. The current sites are seeded by migration `0000_initial.sql`; the super-admin can edit name, accent color, address and the structured address fields on `/admin/locations` (`PATCH /api/admin/sites/:slug`). Creating or deleting sites through the admin is not implemented (FR-019)
- Validation rules: slug must be stable and unique
- Notes: the church is multi-site and growing; the data model must support dynamic site creation at any time. Available sites are fetched at runtime from GET /api/sites and cached client-side via react-query (key: `['sites']`). The `Site` API type is `{ slug: string; name: string; accent: string }`. Each site is referenced by its per-site feed URL `/<slug>/feed.xml` and listed in `/llms.txt` (FR-060, FR-064).

### Content Item
- Purpose: represent a unit of information shown in the hub
- Key attributes: type, site scope, sort order, exclusive site, type-specific fields (see content-model.md)
- Relationships: may belong to one or more sites, or be church-wide; may belong to a Group; may be exclusively scoped to a single site via `exclusive_site`
- Lifecycle: four publishing states — `draft`, `published`, `archived`, `deleted`. The full state machine is defined in `content-model.md` → Shared Metadata → "Publishing state" / "State transitions". Key points:
  - only `published` items appear on the public hub
  - expiry hides an item from the public hub but does not change its state (BR-014); `archived` is set only by the manual "Ascunde" action
  - `deleted` items appear only on the Archive page (`/admin/archive`); restoring returns them to `draft` with `groupId` cleared
- Validation rules: must have a valid content type; mandatory fields per type must be present; `exclusive_site` and a non-empty `sites[]` are mutually exclusive — when `exclusive_site` is set, `sites[]` is forced to `[]` server-side
- Date handling: optional `data.startDate` / `data.endDate` (all types) plus the independent `expiresAt` column. See content-model.md — Expiration Behavior.
- Site exclusivity: nullable `exclusive_site TEXT REFERENCES sites(slug)` (migration `0008_exclusive_site.sql`). See content-model.md — Exclusive Site Scope, BR-006–BR-008, and ADR-009.
- Soft delete cascade: when a Group is deleted, all its child content items are soft-deleted (state set to `deleted`, `groupId` cleared) before the group itself is hard-deleted from the database.
- Notes: an item with `data.startDate` is also an event for the public RSS feeds (FR-060, BR-025); its canonical URL `/i/<id>` (FR-069) is the feed item link (BR-026).

### Group
- Purpose: visually collect Cards and/or Posters into a single display unit
- Key attributes: name/label, site scope, sort order
- Relationships: contains one or more Cards or Posters; belongs to root level
- Lifecycle: created, maintained, deleted by admins. Deletion is a hard delete of the group row; however, all child content items are soft-deleted first (state → `deleted`, groupId cleared) before the group is removed. Groups do not have a soft-delete state of their own.
- Validation rules: may only contain Cards and Posters (enforced by the admin drag-and-drop UI, not by the API); no nested groups allowed
- Site scope: `sites[]` is stored and editable, but not yet applied by the public content API (see content-model.md — Compound Site Scope, BR-005)
- Editing: title and site scope are editable after creation via the inline edit panel on the group header (`PATCH /api/admin/groups/:id`); see FR-026.

### AnalyticsEvent
- Purpose: record a single trackable user interaction (site visit or link click) for aggregation in the admin analytics dashboard
- Key attributes: id (UUID), event_type (`site_visit` | `link_click`), site_slug, item_id (optional — the content item clicked), url (optional — the URL opened), short_link_id (optional UUID — set when the click was triggered by a short link redirect; null for website clicks), occurred_at
- Relationships: site_slug references a Site slug (null for events from the all-sites view); item_id is a soft reference to a Content Item (no FK constraint — events survive soft deletion, but are deleted explicitly, by design, when the item is permanently deleted); short_link_id is a foreign key to ShortLink with `ON DELETE SET NULL` (events survive short link deletion)
- Lifecycle: created via the public `POST /api/events` ingest endpoint (website clicks) or server-side during `GET /s/:code` redirect (short link clicks); never updated; deleted only when the referenced content item is permanently deleted (`DELETE /api/admin/content/:id/permanent`, see content-model.md); read via aggregation endpoints accessible to all admins
- Validation rules: event_type must be one of the two defined values; site_slug is optional (null in the all-sites view); item_id and url are optional and only relevant for `link_click` events; short_link_id is only set for short-link-originated clicks
- Notes: writes are fire-and-forget — `POST /api/events` responds 204 before the DB write completes, and the short-link redirect handler inserts the click without awaiting it. Short-link clicks are deduplicated in memory per IP + code within a 10-minute window. The public app deduplicates `site_visit` events within a 30-minute window using `localStorage` keys (`betel-track-visit-{site}`). Events are deleted only together with a permanently deleted item (intended: permanent delete purges the item's history); reporting is done entirely by aggregation. See FR-024, FR-025, and FR-044.
- Site filtering: the `analytics_events` table has a composite index on `(site_slug, occurred_at)` which makes per-site queries efficient. All three analytics aggregation endpoints (`/overview`, `/items`, `/items/:itemId/daily`) accept an optional `?site=slug` query parameter; omitting it returns cross-site totals. `occurred_at` is stored in UTC and bucketed in the requested `tz` (ADR-017). The admin dashboard exposes this as the `SiteFilter` dropdown (default: "Toate").
- Short link attribution: `short_link_id` allows aggregation endpoints to distinguish website clicks from short-link clicks per item, and to break down short-link clicks by individual link label. Migration: `0010_short_links.sql`. After a short link is deleted, its historical clicks (now `short_link_id IS NULL`) are reported as website clicks by every aggregation (dashboard, range endpoints and MCP tools alike).
- Range reporting: the range endpoints and MCP analytics tools (FR-080–FR-082, BR-040) count every `event_type` generically (`byEventType`), so event types added later appear without changes there.

### ShortLink
- Purpose: represent a short redirect URL tied to a content item and a distribution channel label, enabling per-channel traffic tracking
- Key attributes: id (UUID), content_item_id (FK → Content Item, cascade delete on hard-delete), code (TEXT, unique — 6-character alphanumeric, server-generated), label (TEXT — admin-assigned channel name, e.g. "WhatsApp Manastur"), site_slug (TEXT nullable — if set, `data.siteLinks[site_slug]` is used for URL resolution instead of `data.link`), created_at
- Relationships: belongs to a Content Item (FK with ON DELETE CASCADE); referenced by AnalyticsEvent.short_link_id (FK, `ON DELETE SET NULL`)
- Lifecycle: created on demand by admins via `POST /api/admin/content/:id/short-links` or by an AI agent via the MCP `create_short_link` tool (one service, `services/short-links.ts`; both audit-logged, BR-041); deleted by admins via `DELETE /api/admin/content/:id/short-links/:shortLinkId`; cascade-deleted when the parent content item is permanently hard-deleted. Soft-deleted and archived items retain their short links.
- Validation rules: code must be unique across all short links; label is required (1–100 characters after trimming); site_slug is optional and must match a known site slug if set (400 otherwise); the content item must exist and not be `deleted` (BR-041)
- Notes: `url` (derived, `PUBLIC_BASE_URL` + `/s/<code>`, not stored) is returned by the list and create endpoints and the MCP tools
- Notes: the redirect endpoint (`GET /s/:code`, no `/api` prefix) is registered before the SPA static-serving handler so the code route is not intercepted by the SPA fallback. URL resolution and cascade rules: BR-011, BR-012. See FR-044 and ADR-011.

### Media
- Purpose: represent an uploaded image file tracked by the system for reuse and lifecycle management
- Key attributes: id (UUID), url (relative path `/uploads/<uuid>.webp`, unique, immutable), filename (`<uuid>.webp` on disk), original_name, size (bytes, after processing), mime_type (always `image/webp`), created_at
- Relationships: referenced by Content Items via JSONB fields (`data.imageUrl` for Posters, `data.thumbnail` for Cards)
- Lifecycle: created on upload via `POST /api/admin/media` (or the MCP `upload_media` tool); deleted by admin via `DELETE /api/admin/media/:id` only when no content items reference it
- Validation rules: input must be an `image/*` MIME type, max 5 MB; every upload is re-encoded to WebP (see content-model.md — Image Handling); URL is immutable after creation
- Notes: usage is detected by querying content_items JSONB fields rather than a foreign key relationship. See ADR-003 for rationale and the maintenance obligation if new content types introduce image fields with different names.

### Language
- Purpose: represent a supported display language for the public hub
- Key attributes: id (UUID), code (BCP-47 locale code, e.g. `ro`, `en`), name (display name), is_default (boolean), enabled (boolean)
- Relationships: referenced by UITranslation, ContentTranslation, and GroupTranslation records
- Lifecycle: Romanian (`ro`) is seeded as the default language and cannot be deleted. Additional languages are created, enabled, and disabled by a super-admin via the Translations page (`/admin/translations`). An inactive language is no longer served to public users but its translation records are preserved.
- Validation rules: code must be unique; exactly one language may be default at a time; the default language cannot be deleted or deactivated
- Notes: added in migration `0009_i18n.sql`

### UITranslation
- Purpose: store the translated value for a single UI string key in a given non-default language
- Key attributes: locale (TEXT, FK → languages.code), key (dot-notation translation key, e.g. `nav.viewAll`), value (translated string)
- Relationships: belongs to a Language (via `locale` → `languages.code`); keys correspond 1-to-1 with Romanian source strings managed in the admin Translations editor
- Lifecycle: created or updated in bulk via `PUT /api/admin/translations` when a super-admin saves the translation editor; never deleted individually (deleted implicitly when the parent language is deleted)
- Validation rules: (locale, key) pair is the composite primary key and must be unique
- Notes: the Romanian source strings (~10 public UI strings) are stored in code as the canonical reference; only non-default translations live in the database

### ContentTranslation
- Purpose: store all translated text field values for a single content item in a given non-default language, in one row per (content_item, locale) pair
- Key attributes: id (UUID), content_item_id (FK → Content Item), locale (FK → Language code), data (JSONB, NOT NULL, default `{}`)
- Relationships: belongs to a Content Item and a Language
- Lifecycle: created or updated via `PUT /api/admin/content/:id/translations/:locale`; deleted when the parent content item is deleted or when a language is deleted
- Validation rules: (content_item_id, locale) pair must be unique; links and dates are not translatable and are never stored in translation data
- Notes: the `data` column is a JSONB map of field name → translated value. For most content types this contains only translated text strings (e.g. `{ "title": "...", "description": "...", "content": "..." }`). For Poster and Card types, image fields (`imageUrl` for Poster, `thumbnail` for Card) may also be stored here as locale-specific image overrides. When a locale image is present it takes precedence over the base image via the standard `{ ...original.data, ...translatedData }` merge; if the admin clears a locale image the empty string is filtered out before saving, causing the base image to be used as fallback. Links and dates are always shared across all locales.

### GroupTranslation
- Purpose: store the translated title for a content group in a given non-default language
- Key attributes: id (UUID), group_id (FK → Group), locale (FK → Language.code), title (TEXT NOT NULL — translated group title)
- Table: `group_translations`
- Relationships: belongs to a Group and a Language (via locale code)
- Lifecycle: created or updated via `PUT /api/admin/groups/:id/translations/:locale`; deleted when the parent group or language is deleted
- Validation rules: (group_id, locale) pair must be unique
