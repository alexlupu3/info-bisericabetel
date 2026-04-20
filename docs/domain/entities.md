# Domain Entities

## Entity Template
### Entity Name
- Purpose:
- Key attributes:
- Relationships:
- Lifecycle:
- Validation rules:

Add one section per important domain entity.

## Initial Entities
### Site
- Purpose: represent one local campus or location within the church
- Key attributes: slug (stable unique identifier), name (display label), accent color (used for site-specific branding on the public hub), address, and other operator-defined info fields
- Relationships: linked to events, announcements, curated links, and used for site scoping on Groups and Content Items
- Lifecycle: created and managed entirely through the admin tool; must NOT be hardcoded in the codebase
- Validation rules: slug must be stable and unique
- Notes: the church currently has 4 sites and is growing; the data model must support dynamic site creation at any time. Available sites are fetched at runtime from GET /api/sites and cached client-side via react-query (key: `['sites']`). The `Site` API type is `{ slug: string; name: string; accent: string }`.

### Content Item
- Purpose: represent a unit of information shown in the hub
- Key attributes: type, site scope, sort order, type-specific fields (see content-model.md)
- Relationships: may belong to one or more sites, or be church-wide; may belong to a Group
- Lifecycle: four publishing states — `draft`, `published`, `archived`, `deleted`. Full state machine:
  - `draft` → (publish) → `published` → (hide / "Ascunde") → `archived`
  - `archived` → (restore via PATCH) → `draft` or `published`
  - Any non-deleted state → (delete / "Șterge") → `deleted`
  - `deleted` → (restore / "Restaurează") → `draft` (groupId cleared)
  - `deleted` → (permanent delete / "Șterge definitiv") → removed from DB
  - Expiry auto-transitions a published item to `archived`
  - `archived` items are hidden from the default admin content list but accessible via a filter in the Content page
  - `deleted` items are not visible in the admin Content page; they appear only in the Archive page (`/admin/archive`)
- Validation rules: must have a valid content type; mandatory fields per type must be present
- Date handling: all four content types support optional `startDate` and `endDate` in the JSONB `data` column. Date filtering in the public API and past-item detection in the admin apply uniformly across all types (endDate → startDate priority). The `expiresAt` column is a separate independent expiry mechanism; both are evaluated. See content-model.md — Expiration Behavior for full rules.
- Soft delete cascade: when a Group is deleted, all its child content items are soft-deleted (state set to `deleted`, `groupId` cleared) before the group itself is hard-deleted from the database.

### Group
- Purpose: visually collect Cards and/or Posters into a single display unit
- Key attributes: name/label, site scope, sort order
- Relationships: contains one or more Cards or Posters; belongs to root level
- Lifecycle: created, maintained, deleted by admins. Deletion is a hard delete of the group row; however, all child content items are soft-deleted first (state → `deleted`, groupId cleared) before the group is removed. Groups do not have a soft-delete state of their own.
- Validation rules: may only contain Cards and Posters; no nested groups allowed
- Editing: post-creation editing of title and site scope is supported via an expand-panel form on the group header row in the Content admin page. Clicking "Editează" on a group header expands an inline edit panel (pre-filled with current title and sites) with Save and Cancel actions. Saving issues a PATCH /admin/groups/:id request.

### AnalyticsEvent
- Purpose: record a single trackable user interaction (site visit or link click) for aggregation in the admin analytics dashboard
- Key attributes: id (UUID), event_type (`site_visit` | `link_click`), site_slug, item_id (optional — the content item clicked), url (optional — the URL opened), occurred_at
- Relationships: site_slug references a Site slug; item_id is a soft reference to a Content Item (no FK constraint — events must survive item deletion)
- Lifecycle: created via the public `POST /events` ingest endpoint; never updated or deleted; read via aggregation endpoints accessible to all admins
- Validation rules: event_type must be one of the two defined values; site_slug is required; item_id and url are optional and only relevant for `link_click` events
- Notes: write is fire-and-forget — the API responds 204 before the DB write completes. The PWA deduplicates `site_visit` events within a 30-minute window using `localStorage` keys (`betel-track-visit-{site}`). Events are never deleted; reporting is done entirely by aggregation. See FR-024 and FR-025.
- Site filtering: the `analytics_events` table has a composite index on `(site_slug, occurred_at)` which makes per-site queries efficient. All three analytics aggregation endpoints (`/overview`, `/items`, `/items/:itemId/daily`) accept an optional `?site=slug` query parameter; omitting it returns cross-site totals. The admin dashboard exposes this as the `SiteFilter` dropdown (default: "Toate").

### Media
- Purpose: represent an uploaded image file tracked by the system for reuse and lifecycle management
- Key attributes: id (UUID), url (relative path, unique, immutable), filename (UUID-based on disk), original_name, size (bytes), mime_type, created_at
- Relationships: referenced by Content Items via JSONB fields (`data.imageUrl` for Posters, `data.thumbnail` for Cards)
- Lifecycle: created on upload via `POST /admin/media`; deleted by admin via `DELETE /admin/media/:id` only when no content items reference it
- Validation rules: allowed MIME types — JPEG, PNG, GIF, WebP; max file size 10 MB; URL is immutable after creation
- Notes: usage is detected by querying content_items JSONB fields rather than a foreign key relationship. See ADR-003 for rationale and the maintenance obligation if new content types introduce image fields with different names.

### Language
- Purpose: represent a supported display language for the public hub
- Key attributes: id (UUID), code (BCP-47 locale code, e.g. `ro`, `en`), name (display name), is_default (boolean), enabled (boolean)
- Relationships: referenced by UITranslation, ContentTranslation, and GroupTranslation records
- Lifecycle: Romanian (`ro`) is seeded as the default language and cannot be deleted. Additional languages are created, enabled, and disabled by a super-admin via the Translations page (`/admin/translations`). An inactive language is no longer served to public users but its translation records are preserved.
- Validation rules: code must be unique; exactly one language may be default at a time; the default language cannot be deleted or deactivated
- Notes: added in migration `0008_i18n.sql`

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
- Validation rules: (content_item_id, locale) pair must be unique; only text fields are translatable (images, links, and dates are excluded)
- Notes: the `data` column is a JSONB map of field name → translated string (e.g. `{ "title": "...", "description": "...", "content": "..." }`); images, links, and dates on content items are shared across all locales and are never stored in `data`

### GroupTranslation
- Purpose: store the translated title for a content group in a given non-default language
- Key attributes: id (UUID), group_id (FK → Group), locale (FK → Language.code), title (TEXT NOT NULL — translated group title)
- Table: `group_translations`
- Relationships: belongs to a Group and a Language (via locale code)
- Lifecycle: created or updated via `PUT /api/admin/groups/:id/translations/:locale`; deleted when the parent group or language is deleted
- Validation rules: (group_id, locale) pair must be unique
