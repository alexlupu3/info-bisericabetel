# Content Model

Single source for the content model: content types and fields, the publishing state machine, expiry, site scoping, link resolution, image handling, and duplication. Product requirements link here.

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
  - Start date — stored in `data.startDate` (see Expiration Behavior)
  - End date — stored in `data.endDate` (see Expiration Behavior)
  - Start time — stored in `data.startTime` (`HH:mm`, Romania local time); single-day events only (see Event start time)
  - Location — stored in `data.location`; optional plain text, 1–70 UTF-16 code units, where the event takes place (see Event location)
  - Link (URL) — stored in `data.link`; the default/fallback link used when no per-site override applies
  - Call to action text
  - Site link overrides — stored in `data.siteLinks: Record<string, string>`; optional map of site slug → URL that overrides the default link for a specific site view. Resolved client-side at render time (see Link Resolution Rule below).

### Richtext
- Purpose: communicate information in free-form formatted text (e.g. announcements, instructions)
- Fields:
  - Content (Markdown) `*`
  - Start date — stored in `data.startDate`; when no end date is set, the item is hidden after this date (see Expiration Behavior)
  - End date — stored in `data.endDate`; the item is hidden after this date (requires start date to be set first)
  - Start time — stored in `data.startTime` (`HH:mm`, Romania local time); single-day events only (see Event start time)

### Poster
- Purpose: display a visual announcement or promotional image with an optional link
- Fields:
  - Image `*`
  - Link (URL) — stored in `data.link`; the default/fallback link used when no per-site override applies
  - Site link overrides — stored in `data.siteLinks: Record<string, string>`; optional map of site slug → URL that overrides the default link for a specific site view. Resolved client-side at render time (see Link Resolution Rule below).
  - Start date — stored in `data.startDate`; when no end date is set, the item is hidden after this date (see Expiration Behavior)
  - End date — stored in `data.endDate`; the item is hidden after this date (requires start date to be set first)
  - Start time — stored in `data.startTime` (`HH:mm`, Romania local time); single-day events only (see Event start time)
  - Name (admin-only) — a human-readable label used in the media library to identify which content item is using an image. Stored in `data.name`. Never shown on the public hub. Optional; falls back to the item's UUID if absent.

### Embedded YouTube Video
- Purpose: embed a video directly in the hub
- Fields:
  - Video link (YouTube URL) `*`
  - Start date — stored in `data.startDate`; when no end date is set, the item is hidden after this date (see Expiration Behavior)
  - End date — stored in `data.endDate`; the item is hidden after this date (requires start date to be set first)
  - Start time — stored in `data.startTime` (`HH:mm`, Romania local time); single-day events only (see Event start time)

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
- A Group itself supports site scoping and drag-and-drop ordering (see Compound Site Scope for the current enforcement gap).
- Only Cards and Posters may be placed in a group. This is enforced by the admin drag-and-drop UI (Richtext and Video items cannot be dropped into a group); the API does not validate it.

## Shared Metadata (all content items and groups)
- **Site scope:** define which sites show this item (one site, multiple sites, or all sites)
- **Sort order:** controlled by drag and drop; applies at root level and within groups
- **Locale:** Content is authored in Romanian (the default locale). Text fields on content items (including the card location `data.location`) and group names can be translated into additional enabled languages via the admin content edit form (language dropdown). Links and dates are shared across all locales. Images are also shared across locales for Richtext and Embedded YouTube Video types; however, Poster (`imageUrl`) and Card (`thumbnail`) items can have locale-specific images — admins see image pickers in translation mode for those types and can override the image per locale. When a translation exists for the active locale, it is served by the API; otherwise Romanian values are used as a fallback. The admin interface itself is Romanian-only regardless of the active public locale. See FR-047, FR-037–FR-041 and ADR-014.
- **Publishing state:** every content item has one of four states:
  - `draft` — created but not yet visible on the public hub
  - `published` — live and visible on the public hub (subject to site scope and expiry; an expired item stays `published` but is hidden — BR-014)
  - `archived` — no longer visible on the public hub; set only by the "Ascunde" (Hide) action in the admin (`POST /api/admin/content/:id/archive`). Archived items stay listed on the admin Content page with a muted state indicator (there is no archived filter). Automatic archiving on expiry is planned, not implemented (FR-014).
  - `deleted` — soft-deleted via the "Șterge" (Delete) action. Not visible anywhere in the admin Content page. Only accessible from the Archive page (`/admin/archive`). From there an admin can either restore the item (returns to `draft`) or permanently hard-delete it. Restoring a soft-deleted item clears its `groupId` since the original group may have been deleted.
- **State transitions:**
  - `draft` or `archived` → `published` ("Publică" action, `POST /api/admin/content/:id/publish`)
  - `published` → `archived` ("Ascunde" action)
  - `PATCH /api/admin/content/:id` also accepts an explicit `state`, so any non-deleted state can be set directly through the API
  - Any non-deleted state → `deleted` ("Șterge" action)
  - `deleted` → `draft` ("Restaurează" action on `/admin/archive`, `POST /api/admin/content/:id/restore`; clears `groupId`)
  - `deleted` → removed from DB ("Șterge definitiv" action on `/admin/archive`, `DELETE /api/admin/content/:id/permanent`). This also deletes every `analytics_events` row with that `item_id` and every `audit_log` row with that `entity_id`, so the item's click history and audit trail are removed with it; only a single new `content.permanent-delete` audit entry remains. This is intended: permanent delete removes every trace of the item except the record of its deletion.
  - Any non-deleted state → new `draft` item created (duplicate action, "Duplică" in context menu — see Duplication below)
- **Ownership:** managed by any admin; changes are audit-logged

## Expiration Behavior
- All four content types support automatic expiry via two independent mechanisms. Expiry only hides items from the public hub; it never changes their publishing state (BR-014).

### JSONB Date Fields (unified — all types)
All content types support optional `startDate` and `endDate` fields stored in the JSONB `data` column. These fields were previously exclusive to Card; migration `0005_migrate_card_date.sql` promoted the legacy `data.date` field on existing cards to `data.startDate`.

The public API applies date filtering uniformly across all types using this priority order:
1. If an `endDate` is set → item is hidden after `endDate`
2. If only a `startDate` is set → item is hidden after `startDate`
3. If no JSONB dates are set → no date-based filtering from this mechanism

Both fields are `YYYY-MM-DD` calendar days (BR-015); the admin API (`POST` / `PATCH /api/admin/content`) and both MCP surfaces reject anything else.

"After" means after the **end of that day in Romania** (`Europe/Bucharest`), regardless of the visitor's, editor's or server's time zone (BR-015, [ADR-017](../decisions/ADR-017-timezone-policy.md)). The public API compares `left(data->>'endDate', 10)` (else `startDate`) as text against `to_char(NOW() AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD')`. It is a text comparison on purpose: a malformed legacy value cannot make the query throw, which would otherwise take down the whole public feed.

The public client's defence-in-depth filter (`public/api/filter.ts`) and the admin past-item badge share one `isItemPast()` (`packages/app/src/content-expiry.ts`). It uses the same Bucharest calendar day, so the public hub and the admin agree wherever the viewer is. Card dates are displayed as the stored calendar day, without time zone shifting.

The admin form applies progressive disclosure: the end date input is hidden until a start date is provided.

### Event start time (`data.startTime`)
Optional on all types. A string `HH:mm` (24-hour, `00:00`–`23:59`) meaning the wall-clock time in `Europe/Bucharest` on `data.startDate`. Allowed only when `startDate` is set and the item is single-day (`endDate` absent or equal to `startDate`); the admin API and both MCP surfaces validate the resulting data and answer 400 otherwise (BR-035). Absent means "all day / time unknown" and every consumer renders date-only. The time is shared across locales and sites, like the dates. It does **not** affect expiry (BR-015 still applies through the end of the day) and is a secondary sort key for chronological group ordering (BR-013). The instant it denotes is derived with `eventStartInstant()` / `eventStartIso()` from `@betel/shared` (`packages/shared/src/event-time.ts`), which also provides the per-locale "when" formatter used by public cards, feeds, structured data and notifications. The admin form shows the time input only while the item is single-day and clears it otherwise.

Public cards render the date line through `formatEventWhen()`: "14 noiembrie · 18:00" (`ro`), "November 14 · 6:00 PM" (`en`), both parts from `Intl` in the visitor's language, the time always on the Romanian wall clock. Posters, richtext and video items store the time but do not display dates or times.

### Event location (`data.location`)
Cards only. A plain-text, single-line place name or short address of 1–70 UTF-16 code units describing where the event takes place ("Sala mare, etaj 1"). Every write path (admin API including PATCH type changes, translation API, both MCP surfaces, AI translation) applies one rule to the resulting type and data: it normalises the value (`normalizeLocationText()` in `@betel/shared`: control characters removed, whitespace runs collapsed, trimmed), removes the key when the input is `null` or empty after normalisation, and rejects non-strings, over-long values and non-empty locations on non-card items with HTTP 400 / an MCP tool error (BR-050); stored values are therefore always non-empty. It is translatable per locale like the other text fields, with Romanian fallback at read time, and the AI translation job drops translated values that break the rule (BR-051). Public cards show it as metadata under the date/time row with a map-pin glyph, whether or not the card has a date, never as a link (BR-052); the server-rendered snapshot prints the same row. It is only a human-readable place name: site scope, expiry, sorting and notification targeting ignore it, while the RSS feed and structured data prefer it over the site name when present (BR-053). Consumers read it through `readLocation()` (`packages/shared/src/event-location.ts`), which tolerates unnormalised legacy values.

### `expiresAt` Column (independent mechanism)
The `expiresAt` column on `content_items` is a separate, independent expiry mechanism. It is not replaced by the JSONB date fields. Both mechanisms apply independently:
- The API filters out items where `expiresAt` has passed (existing `gt(contentItems.expiresAt, now)` filter). `expiresAt` is an instant (UTC `TIMESTAMPTZ`); the client compares it as `<= now`, matching the server.
- On write, a date-only `expiresAt` (`YYYY-MM-DD`) is stored as the start of the following day in Europe/Bucharest (the end of that day in Romania); a full timestamp must carry `Z` or an explicit `±HH:MM` offset and is stored as given; anything else (including offsetless timestamps, which would depend on the server's zone, and impossible dates such as `2026-02-30`) returns 400. The admin form does not truncate an existing `expiresAt` to a date on save.
- The API also filters via the JSONB date range logic described above.
- Past-item detection in the admin and the public client safety net (`isItemPast()`) treats the two mechanisms the same way the API does: either one alone marks the item as past, so an `expiresAt` earlier than the event's last day still ends it early.

When any applicable expiry condition is met, the item is automatically hidden from the public view; its state is unchanged (a `published` item stays `published`). Expired items remain visible in the admin tool with a past-item badge; to show one again, move or clear its dates / `expiresAt`. Automatic transition to `archived` is planned (FR-014) but not implemented.

## Image Handling
- Images are uploaded directly to the server — no external URL references.
- Every upload is recorded in the `media` table (`url`, `filename`, `original_name`, `size`, `mime_type`, `created_at`).
- Accepted input: any `image/*` MIME type, up to 5 MB per upload (`MAX_UPLOAD_SIZE` in `packages/api/src/routes/admin/media.ts`).
- Every upload is processed with `sharp`: EXIF auto-rotation, resized down to a maximum width of 1980 px (never enlarged), and re-encoded to WebP (quality 82). The stored file is always `<uuid>.webp` served under `/uploads/`, and the `media` row records `mime_type = image/webp` and the size of the processed file.
- Image URLs are **immutable after upload**. Changing a URL after the fact would silently break all content items that reference it.
- Cards (via `data.thumbnail`) and Posters (via `data.imageUrl`) both reference images by their stored URL.
- The admin Media page provides a gallery view, filter by usage (all / in use / not in use), per-image usage info (which content item uses it), and a delete action for unused images.
- Usage detection: `GET /api/admin/media` and `DELETE /api/admin/media/:id` scan both `content_items.data` and `content_translations.data` for `imageUrl` and `thumbnail` field matches. This covers both base images and locale-specific image overrides on Poster and Card types. If a future content type stores images under a different JSONB field name, the usage query must be extended (see ADR-003).
- Delete is blocked server-side (HTTP 409) for any image currently referenced by a content item.

## Ordering and Site Scoping — Relationship
- **Order is global and admin-defined.** Site scoping only controls visibility (show/hide), never the order items appear.
- Items always appear in their admin-defined position. If an item is hidden for a given site, the remaining items close the gap but retain their relative order.
- Example: items ordered A → B → C where B is hidden for site BETA → site BETA sees A → C (not C → A).
- Admins manage a single unified ordered list. There is no per-site ordering.

### `data.startDate` as a sort key (admin group sort)
In addition to its role in expiry (hiding an item after its start date when no end date is set — see Expiration Behavior above), `data.startDate` serves a second role: it is the sort key used by the group chronological sort feature (FR-046). When an admin clicks "Sortează cronologic" on a group, items are ordered by `data.startDate` ascending (`eventSortKey()`: `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when a start time exists, so untimed items on a date sort before timed ones). Items without a startDate are placed at the end. This same key is used for auto-placement when a new item is created inside a group. The two roles (expiry and sort key) are independent — an item without a startDate is neither hidden from the public hub nor excluded from group sorting; it simply sorts last. Full sort rules: BR-013.

### `data.startDate` as the event marker (feeds)
A third role of `data.startDate`: an item of any type with a non-empty `startDate` is an **event** for the RSS feeds (`/feed.xml`, `/:siteSlug/feed.xml`, FR-060). The feed applies the Expiration Behavior and site scoping above unchanged (it reuses the public content query via `packages/api/src/services/public-content.ts`), then keeps only dated items — the **current and upcoming events**, which include multi-day events already in progress — and orders them with `compareEventSchedules` (BR-013). An item without `startDate` is never a feed item; `endDate` alone does not qualify. Google `Event` structured data (FR-069) starts from this set but additionally requires a resolvable physical place.

## Exclusive Site Scope

Content items support two distinct site scoping concepts that must not be conflated:

### `sites[]` — surfacing hint (non-exclusive)
The `sites` array lists the sites for which an item is *additionally surfaced* in site-specific views. It is a hint, not a gate: items with `sites = []` (the default) appear everywhere, including the all-sites view. Items in `sites[]` also remain visible in the all-sites view. This is the legacy scoping mechanism and remains unchanged.

### `exclusive_site` — hard visibility gate (exclusive)
The nullable `exclusive_site TEXT REFERENCES sites(slug)` column on `content_items` creates a hard visibility boundary:
- When `exclusive_site` is set to a site slug, the item **does not appear** in the all-sites view (`GET /api/content` with no `?site=`).
- The item **only appears** when the content API is called with `?site=<exclusive_site_slug>`.
- The two mechanisms are mutually exclusive on a single row: when `exclusive_site` is set, the server forces `sites = []`. This prevents conflicting semantics.
- A partial DB index on `(exclusive_site) WHERE exclusive_site IS NOT NULL` (migration `0008_exclusive_site.sql`) keeps site-specific queries efficient.

### Admin UI
In the content create/edit form, a "Exclusiv unei locații" (Exclusive to a location) checkbox switches between the two modes:
- **Unchecked** (default): the existing multi-site checkboxes are shown; any combination of sites can be assigned.
- **Checked**: the multi-site checkboxes are replaced by a mandatory single-site radio selector. The selected slug is written to `exclusive_site`; `sites` is cleared to `[]` on save.

Exclusive items in the admin content list are visually distinguished by a Lock icon and a ringed circle badge.

### Per-site link overrides in exclusive mode
The per-site link override UI (see Link Resolution Rule) iterates `sites[]` to decide which site inputs to show. Because `sites = []` in exclusive mode, the override block naturally collapses — no code change was required.

### Groups and exclusive items
Groups do not have an `exclusive_site` field in this iteration. An exclusive item that belongs to a group is still filtered server-side when `exclusive_site` does not match the requested site. This can result in the group rendering with one fewer item in the all-sites view compared with the site-specific view; this is expected behavior.

### Decision rationale
See ADR-009 (site-exclusive content) for the rejected alternative (boolean flag + reusing `sites[]` as a single-element array) and the rationale for choosing a dedicated nullable column.

## Compound Site Scope — Group Scope Takes Precedence
> **Not yet enforced.** Group `sites` are stored and editable in the admin, but the public content API (`GET /api/content`) filters only on item-level `sites[]` / `exclusive_site`. The rule below (BR-005) is the intended behaviour.

- When a group is scoped to specific sites, the **entire group container** (header + all items it contains) is hidden for sites outside the group's scope.
- Individual item site assignments within the group are irrelevant when the group itself is not visible for a given site.
- This means group scope is evaluated first; item scope is only evaluated for items that belong to ungrouped sections or to groups that are visible for the current site.
- Rationale: a group's site assignment communicates the intent that this collection of content is relevant only to certain locations. Allowing individual items within a scoped group to "leak" through to other sites would contradict that intent and confuse both admins and members.

## Duplication

Admins can duplicate any content item (all four types) via the "Duplică" option in the item context menu on the Content page. The backend endpoint is `POST /api/admin/content/:id/duplicate` (auth required, HTTP 201).

**What is copied:**
- `type`, `sites[]`, `exclusiveSite`, `groupId`, `expiresAt`
- All `data` JSONB fields **except** media attachment fields (see below); `startTime` is copied with the other date fields; `location` is copied with the other text fields.

**What is not copied (media attachments):**
- `data.thumbnail` — Card thumbnail image
- `data.imageUrl` — Poster image

Media fields are deliberately excluded: copying an image URL would create a second content item referencing the same `media` row without registering that reference. The media library's usage-detection query would still find both references (preventing deletion), but the relationship would be implicit and potentially confusing. Admins must re-upload or re-select an image on the duplicate.

**Initial state:**
- The duplicate is always created as `draft`, regardless of the source item's state. This ensures the duplicate does not become immediately visible on the public hub.
- Order position is set to `global max + 1` (appended at the end of the entire item list).
- If the original belonged to a group, the duplicate is placed in the same group at the bottom of the group's order.

**Auto-translation:**
- `scheduleContentTranslation` is triggered for the duplicate if `OPEN_ROUTER_API_KEY` is set, same as for newly created items.

**Audit:** action `content.duplicate`, with `detail.sourceId` (original item ID) and `detail.type` (content type) recorded.

## Extensibility Note
The content type system must be designed to allow new types to be added in future without requiring data migrations or codebase restructuring for existing types. When a new type introduces a media attachment field (stored under a new JSONB key), the `MEDIA_FIELDS` map in the duplicate endpoint (`POST /api/admin/content/:id/duplicate`) must be updated to include that field so it is excluded from duplication.
