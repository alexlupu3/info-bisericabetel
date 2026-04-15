# ADR-007: Per-site link overrides resolved client-side in JSONB data

## Status
Accepted

## Date
2026-04-15

## Context

Cards and Posters both have a `link` field (URL). A real need emerged for a single content item to present different destination URLs depending on which site view the member is looking at — for example, a "Donations" card that links to site A's donation account when viewed on site A but to a generic donations page when viewed in the all-sites aggregation.

Three broad approaches were considered:

1. **New per-type DB table** — a dedicated `content_item_site_links` join table with `(item_id, site_slug, url)` rows.
2. **JSONB field on existing `data` column** — add an optional `siteLinks: Record<string, string>` map alongside the existing `data.link` default.
3. **Separate API endpoint + server-side resolution** — the public API resolves the active link server-side and returns only the effective URL based on the requested `siteSlug`.

## Options Considered

**Option 1 — Dedicated join table**
- Pro: relational integrity, queryable without JSONB parsing, clean for analytics.
- Con: schema migration required, adds a new table that other JSONB-based fields don't have, over-engineered for what is a sparse optional field (most items will never use overrides).

**Option 2 — JSONB field (chosen)**
- Pro: zero-migration change; the existing JSONB `data` column absorbs the new field. Consistent with how all other optional type-specific fields are handled (e.g. `data.name`, `data.siteLinks` follows `data.link`). Admin API already accepts arbitrary `data` fields; public API already returns the full `data` blob.
- Con: not relational; can't query "all items that override a specific site" with a simple SQL join (requires JSONB path queries). Acceptable because this use case has not been identified.

**Option 3 — Server-side resolution**
- Pro: leaner client code; the client never needs to know about the `siteLinks` structure.
- Con: the public API already returns the full `data` blob; introducing site-aware resolution would require the client to send its current `activeSite` context on every fetch, add query-param branching to the API, and complicate caching. The public hub already knows the active site from its own URL/state — resolution at render time costs nothing extra.

## Decision

Use **Option 2**: store overrides in `data.siteLinks: Record<string, string>` (JSONB) and resolve the effective link client-side at render time in `CardItem` and `PosterItem`.

Resolution rule:
```
resolvedLink = (activeSite && data.siteLinks?.[activeSite]) || data.link
```

- `activeSite` is the current site slug from the app's routing context (`null` on the all-sites view).
- If no override exists for the active site, falls back to `data.link`.
- The all-sites view always uses `data.link`; overrides are meaningless without a concrete site context.

## Consequences

- **No schema migration needed.** The JSONB `data` column absorbs `siteLinks` without any DDL change. Existing content items are untouched.
- **No API changes needed.** The admin API already persists arbitrary `data` fields. The public API already returns the full `data` blob. Both keep working as-is.
- **Client-side resolution** is consistent with how the PWA already handles other data fields (date visibility, poster name, etc.).
- **Override scope is link URL only.** CTA text and all other Card/Poster fields remain global. Expanding scope to other fields would require re-evaluation of this ADR.
- **All-sites view always uses the default link.** There is no "all-sites override" concept — the fallback `data.link` serves that purpose.
- **Admin UX pattern:** a collapsible "Link-uri per locație" section appears below the link input. It renders one URL input per site within the item's scope (or all sites if unscoped). Empty inputs are stripped from the payload before saving, keeping `data.siteLinks` sparse.
- **Future query concern:** if a future requirement needs "find all items that override site X", a JSONB containment query (`data->'siteLinks' ? 'site-slug'`) is sufficient but should prompt revisiting whether a join table is warranted at that point.
