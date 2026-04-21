# Content Model

## Design Principles
- Content types are extensible — new types can be defined in the future without restructuring the system.
- All content items and groups share a common set of metadata (see Shared Metadata below).
- Mandatory fields are marked with `*`; all others are optional.

## Content Types

### Card
- Purpose: highlight an event, activity, or resource with visual and action affordances
- Fields:
  - Title `*`
  - Description
  - Thumbnail (image)
  - Start date
  - End date
  - Link (URL) — stored in `data.link`; the default/fallback link used when no per-site override applies
  - Call to action text
  - Site link overrides — stored in `data.siteLinks: Record<string, string>`; optional map of site slug → URL that overrides the default link for a specific site view. Resolved client-side at render time (see Link Resolution Rule below).

### Richtext
- Purpose: communicate information in free-form formatted text (e.g. announcements, instructions)
- Fields:
  - Content (Markdown) `*`
  - Start date — stored in `data.startDate`; item is hidden before this date if provided
  - End date — stored in `data.endDate`; item is hidden after this date if provided (requires start date to be set first)

### Poster
- Purpose: display a visual announcement or promotional image with an optional link
- Fields:
  - Image `*`
  - Link (URL) — stored in `data.link`; the default/fallback link used when no per-site override applies
  - Site link overrides — stored in `data.siteLinks: Record<string, string>`; optional map of site slug → URL that overrides the default link for a specific site view. Resolved client-side at render time (see Link Resolution Rule below).
  - Start date — stored in `data.startDate`; item is hidden before this date if provided
  - End date — stored in `data.endDate`; item is hidden after this date if provided (requires start date to be set first)
  - Name (admin-only) — a human-readable label used in the media library to identify which content item is using an image. Stored in `data.name`. Never shown on the public hub. Optional; falls back to the item's UUID if absent.

### Embedded YouTube Video
- Purpose: embed a video directly in the hub
- Fields:
  - Video link (YouTube URL) `*`
  - Start date — stored in `data.startDate`; item is hidden before this date if provided
  - End date — stored in `data.endDate`; item is hidden after this date if provided (requires start date to be set first)

## Link Resolution Rule (Cards and Posters)

When a Card or Poster has both a default link (`data.link`) and site-specific overrides (`data.siteLinks`), the resolved link is determined at render time on the client:

```
resolvedLink = (activeSite && data.siteLinks?.[activeSite]) || data.link
```

- **Site-specific view** — if a siteLinks entry exists for the active site slug, that URL is used; otherwise the default link is used.
- **All-sites view** (`activeSite = null`) — always uses the default link; per-site overrides are ignored.
- **Override granularity** — only the link URL is overridable per site; CTA text and all other fields remain shared across all views.
- **Backward compatibility** — `data.siteLinks` is optional. Existing items with only `data.link` are unaffected; the JSONB column absorbs the new field without a schema migration.
- **Admin UX** — a collapsible "Link-uri per locație" section appears below the link input (only when a default link is set). It shows one URL input per relevant site (filtered by the item's site scope, or all sites if unscoped). Empty overrides are omitted from the saved payload.

## Groups
- Cards and Posters can be collected into a **Group** for display purposes.
- Groups can appear at root level alongside ungrouped items.
- **One level of nesting only** — groups cannot contain other groups.
- A Group itself supports site scoping and drag-and-drop ordering.

## Shared Metadata (all content items and groups)
- **Site scope:** define which sites show this item (one site, multiple sites, or all sites)
- **Sort order:** controlled by drag and drop; applies at root level and within groups
- **Locale:** Content is authored in Romanian (the default locale). Text fields on content items and group names can be translated into additional enabled languages via the admin content edit form (language dropdown). Links and dates are shared across all locales. Images are also shared across locales for Richtext and Embedded YouTube Video types; however, Poster (`imageUrl`) and Card (`thumbnail`) items can have locale-specific images — admins see image pickers in translation mode for those types and can override the image per locale. When a translation exists for the active locale, it is served by the API; otherwise Romanian values are used as a fallback. The admin interface itself is Romanian-only regardless of the active public locale. See FR-036–FR-041.
- **Publishing state:** every content item has one of four states:
  - `draft` — created but not yet visible on the public hub
  - `published` — live and visible on the public hub (subject to site scope and expiry)
  - `archived` — no longer visible on the public hub; auto-transitioned when an item expires, or manually set via the "Ascunde" (Hide) action in the admin. Archived items are hidden from the default admin content list but remain accessible via a filter on the Content page.
  - `deleted` — soft-deleted via the "Șterge" (Delete) action. Not visible anywhere in the admin Content page. Only accessible from the Archive page (`/admin/archive`). From there an admin can either restore the item (returns to `draft`) or permanently hard-delete it. Restoring a soft-deleted item clears its `groupId` since the original group may have been deleted.
- **State transitions:**
  - `draft` → `published` (publish action)
  - `published` → `archived` (hide / "Ascunde" action, or automatic expiry)
  - `archived` → `draft` or `published` (PATCH restore action on the Content page)
  - Any non-deleted state → `deleted` ("Șterge" action)
  - `deleted` → `draft` ("Restaurează" action on `/admin/archive`)
  - `deleted` → removed from DB ("Șterge definitiv" action on `/admin/archive`)
- **Ownership:** managed by any admin; changes are audit-logged

## Expiration Behavior
- All four content types support automatic expiry via two independent mechanisms:

### JSONB Date Fields (unified — all types)
All content types support optional `startDate` and `endDate` fields stored in the JSONB `data` column. These fields were previously exclusive to Card; migration `0005_migrate_card_date.sql` promoted the legacy `data.date` field on existing cards to `data.startDate`.

The public API applies date filtering uniformly across all types using this priority order:
1. If an `endDate` is set → item is hidden after `endDate`
2. If only a `startDate` is set → item is hidden after `startDate`
3. If no JSONB dates are set → no date-based filtering from this mechanism

The admin past-item badge (`isItemPast()`) follows the same priority: `endDate` → `startDate`.

The admin form applies progressive disclosure: the end date input is hidden until a start date is provided.

### `expiresAt` Column (independent mechanism)
The `expiresAt` column on `content_items` is a separate, independent expiry mechanism. It is not replaced by the JSONB date fields. Both mechanisms apply independently:
- The API filters out items where `expiresAt` has passed (existing `gt(contentItems.expiresAt, now)` filter).
- The API also filters via the JSONB date range logic described above.
- For past-item detection in the admin: JSONB dates take precedence over `expiresAt`.

When any applicable expiry condition is met, the item is automatically hidden from the public view. Expired items remain visible in the admin tool and can be re-published or permanently deleted.

## Image Handling
- Images are uploaded directly to the server — no external URL references.
- Every upload is recorded in the `media` table (`url`, `filename`, `original_name`, `size`, `mime_type`, `created_at`).
- Allowed formats: JPEG, PNG, GIF, WebP. Maximum file size: 10 MB.
- Image URLs are **immutable after upload**. Changing a URL after the fact would silently break all content items that reference it.
- Cards (via `data.thumbnail`) and Posters (via `data.imageUrl`) both reference images by their stored URL.
- The admin Media page provides a gallery view, filter by usage (all / in use / not in use), per-image usage info (which content item uses it), and a delete action for unused images.
- Usage detection: `GET /admin/media` and `DELETE /admin/media/:id` scan both `content_items.data` and `content_translations.data` for `imageUrl` and `thumbnail` field matches. This covers both base images and locale-specific image overrides on Poster and Card types. If a future content type stores images under a different JSONB field name, the usage query must be extended (see ADR-003).
- Delete is blocked server-side (HTTP 409) for any image currently referenced by a content item.

## Ordering and Site Scoping — Relationship
- **Order is global and admin-defined.** Site scoping only controls visibility (show/hide), never the order items appear.
- Items always appear in their admin-defined position. If an item is hidden for a given site, the remaining items close the gap but retain their relative order.
- Example: items ordered A → B → C where B is hidden for site BETA → site BETA sees A → C (not C → A).
- Admins manage a single unified ordered list. There is no per-site ordering.

## Compound Site Scope — Group Scope Takes Precedence
- When a group is scoped to specific sites, the **entire group container** (header + all items it contains) is hidden for sites outside the group's scope.
- Individual item site assignments within the group are irrelevant when the group itself is not visible for a given site.
- This means group scope is evaluated first; item scope is only evaluated for items that belong to ungrouped sections or to groups that are visible for the current site.
- Rationale: a group's site assignment communicates the intent that this collection of content is relevant only to certain locations. Allowing individual items within a scoped group to "leak" through to other sites would contradict that intent and confuse both admins and members.

## Extensibility Note
The content type system must be designed to allow new types to be added in future without requiring data migrations or codebase restructuring for existing types.
