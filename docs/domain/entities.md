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
- Lifecycle: `draft` → `published` → `archived`. Expiry auto-transitions a published item to archived. Archived items are hidden from the default admin content list (accessible via filter) and not shown on the public hub.
- Validation rules: must have a valid content type; mandatory fields per type must be present
- Date handling: all four content types support optional `startDate` and `endDate` in the JSONB `data` column. Date filtering in the public API and past-item detection in the admin apply uniformly across all types (endDate → startDate priority). The `expiresAt` column is a separate independent expiry mechanism; both are evaluated. See content-model.md — Expiration Behavior for full rules.

### Group
- Purpose: visually collect Cards and/or Posters into a single display unit
- Key attributes: name/label, site scope, sort order
- Relationships: contains one or more Cards or Posters; belongs to root level
- Lifecycle: created, maintained, deleted by admins
- Validation rules: may only contain Cards and Posters; no nested groups allowed
- Editing: post-creation editing of title and site scope is supported via an expand-panel form on the group header row in the Content admin page. Clicking "Editează" on a group header expands an inline edit panel (pre-filled with current title and sites) with Save and Cancel actions. Saving issues a PATCH /admin/groups/:id request.

### AnalyticsEvent
- Purpose: record a single trackable user interaction (site visit or link click) for aggregation in the admin analytics dashboard
- Key attributes: id (UUID), event_type (`site_visit` | `link_click`), site_slug, item_id (optional — the content item clicked), url (optional — the URL opened), occurred_at
- Relationships: site_slug references a Site slug; item_id is a soft reference to a Content Item (no FK constraint — events must survive item deletion)
- Lifecycle: created via the public `POST /events` ingest endpoint; never updated or deleted; read via aggregation endpoints accessible to all admins
- Validation rules: event_type must be one of the two defined values; site_slug is required; item_id and url are optional and only relevant for `link_click` events
- Notes: write is fire-and-forget — the API responds 204 before the DB write completes. The PWA deduplicates `site_visit` events within a 30-minute window using `localStorage` keys (`betel-track-visit-{site}`). Events are never deleted; reporting is done entirely by aggregation. See FR-024 and FR-025.

### Media
- Purpose: represent an uploaded image file tracked by the system for reuse and lifecycle management
- Key attributes: id (UUID), url (relative path, unique, immutable), filename (UUID-based on disk), original_name, size (bytes), mime_type, created_at
- Relationships: referenced by Content Items via JSONB fields (`data.imageUrl` for Posters, `data.thumbnail` for Cards)
- Lifecycle: created on upload via `POST /admin/media`; deleted by admin via `DELETE /admin/media/:id` only when no content items reference it
- Validation rules: allowed MIME types — JPEG, PNG, GIF, WebP; max file size 10 MB; URL is immutable after creation
- Notes: usage is detected by querying content_items JSONB fields rather than a foreign key relationship. See ADR-003 for rationale and the maintenance obligation if new content types introduce image fields with different names.
