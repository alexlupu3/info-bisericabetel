# ADR-003: Image Library Management

## Status
Accepted

## Date
2026-03-17

## Context
The content model (Posters and Cards) requires image uploads. Before this feature, images could be uploaded but there was no admin UI for browsing, reusing, or cleaning up previously uploaded files. This created two problems:

1. **Discoverability:** admins had no way to see what images had been uploaded, so duplicates accumulated.
2. **Disk hygiene:** orphaned uploads (images no longer referenced by any content item) could not be identified or removed.

FR-017 already stated the requirement: "A media library allows admins to browse and reuse previously uploaded images." This ADR records the decisions made when implementing that requirement.

## Decisions

### 1. A dedicated `media` table tracks all uploaded files
A new `media` table was added to the database schema with the following columns:
- `id` (UUID, primary key)
- `url` (text, unique) — the relative URL served to clients, e.g. `/uploads/<filename>`
- `filename` (text) — the UUID-based filename stored on disk
- `original_name` (text) — the filename as uploaded by the admin
- `size` (integer) — file size in bytes
- `mime_type` (text) — MIME type detected at upload time
- `created_at` (timestamp with timezone)

Every upload is recorded in this table. This makes the media library queryable and allows usage detection without scanning the filesystem.

### 2. The upload endpoint (`POST /admin/media`) records every upload
When an image is uploaded, a row is inserted into the `media` table immediately after the file is written to disk. The endpoint returns `{ url, id }`.

Constraints enforced at upload:
- Allowed extensions: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Maximum file size: 10 MB

### 3. Usage detection uses JSONB field queries on `content_items` and `content_translations`
Usage is determined by querying both tables for matching image URL values:

- `content_items.data->>'imageUrl' = <url>` (matches Poster base images)
- `content_items.data->>'thumbnail' = <url>` (matches Card base images)
- `content_translations.data->>'imageUrl' = <url>` (matches locale-specific Poster images)
- `content_translations.data->>'thumbnail' = <url>` (matches locale-specific Card images)

Both `GET /admin/media` (list + usedBy) and `DELETE /admin/media/:id` (in-use block) apply this expanded scan. This is necessary because Poster and Card items can have locale-specific image overrides stored in `contentTranslations.data`; an image used only by a locale override would otherwise appear as unused and be deletable while still actively referenced.

This approach does not require a foreign key relationship between `media` and `content_items`/`content_translations`. It relies on the JSONB data contract for each content type. If a new content type introduces images via a different JSONB field name, the usage query in both endpoints must be updated.

### 4. Poster items gain an admin-only `name` field stored in `data.name`
Posters previously had no human-readable identifier beyond their image. A `name` field is added to the Poster content type, stored in the JSONB `data` column as `data.name`. This field is:
- Admin-only — never shown on the public hub
- Used as the display label in media usage info (the `GET /admin/media` endpoint returns `name` as the identifier for a Poster, falling back to `title` and then `id` for other types)
- Optional — existing Posters without a name fall back to their UUID in the usage list

### 5. A new `/media` route is added to the admin SPA
A "Media" page is added to the admin navigation alongside "Conținut" and "Locații". It provides:
- A gallery view of all uploaded images
- Filter tabs: All / In use / Not in use
- Per-image usage info: which content item uses it (name/title or id)
- A delete button on images that are not in use

The delete action calls `DELETE /admin/media/:id`. The API enforces the "not in use" constraint server-side and returns HTTP 409 if the image is still referenced.

### 6. Delete is blocked server-side for images in use
The `DELETE /admin/media/:id` endpoint:
1. Looks up the media row; returns 404 if not found
2. Checks for any `content_items` referencing the URL; returns 409 if found
3. Deletes the file from disk (tolerates missing file — continues to DB cleanup)
4. Deletes the `media` row from the database

The file is deleted from disk before the database row so that a partial failure leaves the DB as the source of truth.

## Options Considered — Usage Detection

### Option A: Foreign key from `content_items` to `media` (not chosen)
Would require schema changes to `content_items` and migration of existing data. Adds referential integrity but conflicts with the extensible JSONB data model for content types. New content types would need to opt in to the FK explicitly.

### Option B: JSONB field scan (chosen)
No schema changes to `content_items`. Relies on the known JSONB field names (`imageUrl`, `thumbnail`). Straightforward to implement. Requires updating the query if a new content type uses a different image field name. Acceptable for Phase 1 given the small number of content types.

## Consequences
- Admins can browse, inspect, and clean up uploaded images without developer access.
- Disk usage is bounded — unused images can be deleted from the admin UI.
- The `media` table is the authoritative record of all uploaded files. Files on disk without a corresponding `media` row are orphans (possible only if the DB insert failed after the file was written — a narrow failure window).
- The Poster content type now has a `name` field that must be handled in the content create/edit form (optional field, admin-only, never rendered publicly).
- If a new content type stores image URLs under a JSONB field name other than `imageUrl` or `thumbnail`, the usage detection query must be extended. This is documented as a known maintenance obligation.

## Known Limitation
Usage detection is based on exact URL string matching in JSONB. If a media record's URL is ever changed (e.g. during a CDN migration), usage links will break silently. URL immutability after upload is therefore a hard constraint.

## Update History
- 2026-03-17: ADR written; `media` table, all three API endpoints, and admin SPA route implemented.
- 2026-04-21: Usage detection contract expanded to also scan `content_translations.data` for `imageUrl` and `thumbnail` fields. Required by the locale-specific images feature for Poster and Card types; without this, locale image overrides stored in translation rows would appear as unused and be deletable while still actively referenced.
