# ADR-009: Dedicated Column for Site-Exclusive Content (vs. Overloaded `sites[]`)

**Date:** 2026-04-21
**Status:** Accepted

## Context

The existing `sites` array on `content_items` acts as a surfacing hint: items with `sites = []` appear everywhere (including the all-sites view); items with one or more slugs in `sites[]` are additionally surfaced in those site-specific views, but remain visible in the all-sites view. This is a non-exclusive mechanism.

A new product requirement (FR-036) calls for a hard visibility gate: certain content items must be invisible in the all-sites view and appear only when a specific site is selected. This is a fundamentally different semantic from the existing hint, and the two must coexist on the same table.

## Options Considered

**Option A — Boolean flag + reuse `sites[]` as a single-element array**
Add a boolean `is_exclusive` column. When true, treat `sites` as a single-element array (must contain exactly one slug) that doubles as the exclusive site. Reads as: "exclusive, and the site is `sites[0]`."

Rejected. This overloads `sites[]` with two incompatible semantics: a multi-value surfacing hint (Option A off) vs. a single-value gate (Option A on). Runtime validation ("must contain exactly one slug when exclusive") leaks into multiple layers (API write path, form validation, read queries). Existing code that iterates `sites[]` — such as the per-site link override UI — would require guards everywhere. It also makes the DB schema harder to understand at a glance.

**Option B — Dedicated nullable column `exclusive_site TEXT REFERENCES sites(slug)`**
Add a new column that is null by default. When set, the item is hidden from the all-sites view and visible only for the matching site. The `sites[]` array is forced to `[]` when `exclusive_site` is set, making the relationship explicit and unambiguous. A partial index on `(exclusive_site) WHERE exclusive_site IS NOT NULL` keeps the site-specific filter efficient.

## Decision

Option B — dedicated nullable column.

The dedicated column matches the project's established convention of using first-class columns for first-class concepts (`expiresAt`, `groupId`). The semantics are immediately legible from the schema: null means "not exclusive"; a slug value means "exclusive to this site." No runtime "must be exactly one slug" invariant is needed. Queries, constraints, and the admin UI toggle map cleanly to a single column check.

The `sites[]` array retains its original surfacing-hint semantics without modification. The server enforces `sites = []` on write whenever `exclusive_site` is set to prevent semantic conflicts.

## Architecture

### Schema change

```sql
ALTER TABLE content_items ADD COLUMN exclusive_site TEXT REFERENCES sites(slug);
CREATE INDEX content_items_exclusive_site_idx
  ON content_items (exclusive_site)
  WHERE exclusive_site IS NOT NULL;
```

Migration file: `packages/api/src/db/migrations/0008_exclusive_site.sql`

### API behaviour

- `GET /api/content` (no `?site=`): adds `WHERE exclusive_site IS NULL` to exclude exclusive items.
- `GET /api/content?site=<slug>`: includes items where `exclusive_site = slug` OR `exclusive_site IS NULL` (i.e. non-exclusive items also appear in site-specific views).
- Write path (`POST /admin/content`, `PATCH /admin/content/:id`): when `exclusive_site` is present and non-null, `sites` is overwritten to `[]` before persisting.
- `PATCH /admin/content/:id` clear-case guard: if the request sets `exclusive_site` to null on a currently-exclusive row, a `sites` array must be explicitly provided in the same request body. Omitting `sites` returns `400 { error: 'sites is required when clearing exclusiveSite' }`. This prevents a silent widening of visibility scope (an exclusive row carries `sites = []`, which without the guard would make the item visible to all sites after clearing).

### Admin UI

A "Exclusiv unei locații" checkbox in the content create/edit form toggles between:
- **Unchecked:** multi-site checkboxes (existing behaviour, `sites[]` written, `exclusive_site` set to null).
- **Checked:** single mandatory radio selector; selected slug written to `exclusive_site`; `sites` cleared.

Exclusive items in the admin content list display a Lock icon and a ringed circle badge for quick identification.

### Groups

Groups do not receive an `exclusive_site` column in this iteration. An exclusive item inside a group is filtered at the item level by the API — the group may render with fewer items in the all-sites view. This is accepted behavior (see BR-008).

### Per-site link overrides (no change required)

The link override UI iterates `sites[]` to render per-site URL inputs. Because `sites = []` in exclusive mode, the override block naturally collapses — no code path needed a guard.

## Consequences

- The `exclusive_site` column is a first-class part of the `content_items` schema. Any future tooling that reads or writes `content_items` must be aware of it.
- The `sites[]` surfacing hint retains its original semantics unchanged; existing rows and code are unaffected.
- Adding exclusive-mode support to Groups is deferred. If needed in the future, an `exclusive_site` column can be added to the `groups` table following the same pattern.
- The partial index adds a small amount of index storage but has negligible impact on write throughput.
