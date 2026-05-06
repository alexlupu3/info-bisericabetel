# Business Rules

Record rules that must stay true regardless of implementation details.

## Rules
- BR-001: Content may belong to a specific church site or to the whole church.
- BR-002: Users must be able to access site-relevant content without losing the ability to view all church content.
- BR-003: Core information categories include events, important information, and bookmarked links.
- BR-004: Access paths should support both QR-code entry and direct-link entry.
- BR-005: When a group is scoped to specific sites, the entire group container (header and all items) is hidden for sites outside that scope. Group site scope takes precedence over individual item site scope. Items inside a site-scoped group are never visible on sites excluded by the group, regardless of their own site assignment.
- BR-006: When a content item has `exclusive_site` set, it is hidden from the all-sites view (`GET /api/content` with no `?site=` parameter) and visible only when that specific site is selected (`GET /api/content?site=<slug>`). This is a hard visibility rule — the item does not appear in church-wide listings regardless of its `sites[]` array.
- BR-007: The `exclusive_site` column and the `sites[]` array are mutually exclusive on a single content item row. When `exclusive_site` is set, the server forces `sites = []` to prevent conflicting scoping semantics. The `sites[]` array continues to function as a surfacing hint (non-exclusive visibility) on rows where `exclusive_site` is null. Corollary: clearing `exclusive_site` (setting it to null via `PATCH /admin/content/:id`) requires an explicit `sites` array in the same request; the API returns 400 otherwise, because an exclusive row's stored `sites = []` would otherwise silently make the item visible to all sites.
- BR-008: Groups do not support the `exclusive_site` flag. An exclusive content item that belongs to a group will be hidden from the all-sites view at the item level — this can cause the group to render with fewer items in the all-sites view than in the site-specific view.

- BR-009: Duplicating a content item always creates a new item in `draft` state, regardless of the source item's state. Media attachment fields (`data.thumbnail` for cards, `data.imageUrl` for posters) are never copied — the duplicate starts with no image. All other `data` fields, site scope (`sites[]`, `exclusiveSite`), group assignment (`groupId`), and expiry (`expiresAt`) are copied from the source. The duplicate is appended at the end of the global item list and assigned to the same group as the original if applicable.
- BR-010: When a new content type is introduced that includes a media attachment field in its `data` JSONB payload, the `MEDIA_FIELDS` map in the duplicate endpoint must be updated to exclude that field from duplication. Failure to do so would silently copy a media URL reference without tracking it in the media library.

- BR-011: Short links are cascade-deleted when their parent content item is permanently hard-deleted from the database. Soft-deleting or archiving a content item does not affect its short links — they continue to exist and redirect visitors to the current destination URL. This ensures admins can temporarily hide content without breaking distributed short links (e.g. a QR code already printed on flyers).
- BR-012: The destination URL for a short link redirect is resolved dynamically at redirect time by reading the content item's current `data.link` value (or `data.siteLinks[siteSlug]` if a site override is configured on the short link). This means changing the content item's link automatically updates where all short links for that item redirect, with no need to update or re-create the short links. If no URL can be resolved, the redirect falls back to `/`.

## Source
- Stakeholder or document: initial product context provided by repository owner
- Date confirmed: 2026-03-12
- BR-005 added: 2026-03-17 (resolved during group site-scope implementation)
- BR-006, BR-007, BR-008 added: 2026-04-21 (site-exclusive content feature, migration 0008_exclusive_site.sql)
- BR-009, BR-010 added: 2026-05-02 (duplicate content item feature, FR-042)
- BR-011, BR-012 added: 2026-05-06 (short link tracking feature, FR-044, migration 0010_short_links.sql)
