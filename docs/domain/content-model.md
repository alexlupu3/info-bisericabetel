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
  - Link (URL)
  - Call to action text

### Richtext
- Purpose: communicate information in free-form formatted text (e.g. announcements, instructions)
- Fields:
  - Content (Markdown) `*`
  - Expiration date — item is automatically hidden after this date if provided

### Poster
- Purpose: display a visual announcement or promotional image with an optional link
- Fields:
  - Image `*`
  - Link (URL)
  - Expiration date — item is automatically hidden after this date if provided

### Embedded YouTube Video
- Purpose: embed a video directly in the hub
- Fields:
  - Video link (YouTube URL) `*`
  - Expiration date — item is automatically hidden after this date if provided

## Groups
- Cards and Posters can be collected into a **Group** for display purposes.
- Groups can appear at root level alongside ungrouped items.
- **One level of nesting only** — groups cannot contain other groups.
- A Group itself supports site scoping and drag-and-drop ordering.

## Shared Metadata (all content items and groups)
- **Site scope:** define which sites show this item (one site, multiple sites, or all sites)
- **Sort order:** controlled by drag and drop; applies at root level and within groups
- **Locale:** No translation layer. Content is stored and displayed in whatever language it was written. The admin UI is in English. No i18n system is required.
- **Publishing state:** every content item has one of three states:
  - `draft` — created but not yet visible on the public hub
  - `published` — live and visible on the public hub (subject to site scope and expiry)
  - `archived` — no longer visible on the public hub; auto-transitioned when an item expires, or manually set by an admin. Archived items are hidden from the default admin content list but remain accessible via a filter.
- **Ownership:** managed by any admin; changes are audit-logged

## Expiration Behavior
- All four content types support automatic expiry.
- **Richtext, Poster, Embedded YouTube Video:** expiry is controlled by an explicit optional expiration date field.
- **Card:** expiry is derived from its date fields using this priority order:
  1. If an end date is set → end date is the expiry
  2. If only a start date is set → start date is the expiry
  3. If no dates are set → the card is treated as permanent (no expiry)
- When an item's expiry date has passed, it is automatically hidden from the public view.
- Expired items remain visible in the admin tool and can be re-published or permanently deleted.

## Image Handling
- Images are uploaded directly to the server — no external URL references.
- A dedicated image management service (media library) is required so admins can browse and reuse previously uploaded images instead of re-uploading duplicates.
- Cards (thumbnail) and Posters (image) both use this shared image library.

## Ordering and Site Scoping — Relationship
- **Order is global and admin-defined.** Site scoping only controls visibility (show/hide), never the order items appear.
- Items always appear in their admin-defined position. If an item is hidden for a given site, the remaining items close the gap but retain their relative order.
- Example: items ordered A → B → C where B is hidden for site BETA → site BETA sees A → C (not C → A).
- Admins manage a single unified ordered list. There is no per-site ordering.

## Extensibility Note
The content type system must be designed to allow new types to be added in future without requiring data migrations or codebase restructuring for existing types.
