---
status: Accepted
date: 2026-05-06
---

# ADR-011: Short Link URL Resolved Dynamically at Redirect Time

## Status
Accepted

## Context

Short links (e.g. `betel.ro/s/abc123`) are created by admins for a content item and labeled with a distribution channel (e.g. "WhatsApp Manastur", "QR cod intrare"). When a visitor follows a short link, the server must redirect them to a destination URL.

A key question is: when should the destination URL be determined and where should it be stored?

Two broad options exist:

1. **Store the destination URL on the short link at creation time** — the `short_links` row holds a `destination_url` column, populated when the admin creates the short link.
2. **Resolve the destination URL dynamically at redirect time** — the `short_links` row holds only a reference to the content item (and an optional `site_slug` for per-site override selection); the redirect handler reads the item's current `data.link` (or `data.siteLinks[siteSlug]`) at the moment of the redirect.

The project already has a mechanism for per-site link overrides stored in `data.siteLinks` (see ADR-007). Cards and Posters can have different destination URLs per site, and admins update these through the content edit form at any time.

## Options Considered

### Option A: Store URL at creation time
- Pros: redirect is a single DB lookup with no join; destination is immutable per short link.
- Cons: if the admin updates `data.link` on the content item (e.g. a broken link, a new campaign URL), all existing short links still redirect to the old URL. Admins would need to delete and re-create every short link whenever the content item's URL changes. For printed QR codes or links already distributed, this is not viable — the printed URL cannot be changed. Keeping short link destination URLs in sync with the content item is a manual and error-prone process.

### Option B: Resolve URL dynamically at redirect time (chosen)
- Pros: updating `data.link` on a content item automatically updates the destination for all its short links — distributed short links (QR codes, message threads) stay valid without admin intervention. Per-site link override logic (`data.siteLinks`) is reused naturally by storing only a `site_slug` override on the short link rather than a full URL.
- Cons: redirect requires a DB read of the content item in addition to the short link row (one extra join or sequential query). This is negligible given the scale and infrastructure of this project.

## Decision

Use **Option B**: resolve the destination URL at redirect time.

The `short_links` table stores:
- `content_item_id` — FK to the content item (cascade delete on hard-delete)
- `code` — the short link code
- `label` — admin-assigned channel label
- `site_slug` — optional; if set, `data.siteLinks[site_slug]` is used for resolution; otherwise `data.link` is used

Resolution rule at redirect time:

```
destination = site_slug
  ? (contentItem.data.siteLinks?.[site_slug] || contentItem.data.link)
  : contentItem.data.link

redirect to (destination || '/')
```

If no URL can be resolved (item has no link, or the short link code is not found), the redirect falls back to `/`.

## Consequences

- **Updating a content item's link automatically updates all its short links** — no manual synchronization needed. This is especially important for links distributed via QR codes or printed materials.
- **Per-site override reuse**: the `site_slug` field on the short link is a thin selector into the existing `data.siteLinks` map, not a separate URL store. Admins manage site-specific URLs in one place (the content edit form) and the short link simply opts in to a particular site's override.
- **Redirect performance**: each redirect triggers a query for the short link row and a read of the content item. At the traffic volumes this application serves, this is not a concern. Caching is not warranted.
- **Soft-delete / archive safety**: because the URL is read at redirect time, soft-deleted or archived items still have a `data.link` value. Their short links continue to redirect visitors to the last-known URL. Only a permanent hard-delete removes the short link (via cascade).
- **Unresolved codes**: any code not found in the database redirects to `/` silently — no 404 or error page exposed to visitors.
- **Redirect route ordering**: the `GET /s/:code` route must be registered on the Fastify server before the SPA static-serving handler, so short link codes are not intercepted by the SPA fallback and returned as `index.html`.
