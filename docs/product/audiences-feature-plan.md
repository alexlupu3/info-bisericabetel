# Audiences Feature — Implementation Plan

## Context

The app currently separates content by **Sites** (physical church locations). This feature introduces a new, orthogonal dimension of content separation called **Audiences** — targeted at demographic groups like youth, seniors, families, guests, etc.

This was already anticipated in the project roadmap as "Profile-based views" (Phase 2). The implementation below turns that concept into a concrete, fully-specified feature.

### Key Design Decisions (confirmed)

| Decision | Choice |
|----------|--------|
| Entity name | **Audience** (not "View" — avoids collision with existing UI terminology) |
| Public URL | **`/v/{slug}`** (prefixed — no conflict with `/:siteSlug` routes) |
| Content model | **Reference-based** (join table, same DB row in both site feed and audience) |
| Scoping | **Additive** — items can belong to sites AND audiences simultaneously |
| Theming | **Rich** — accent color, background color, logo per audience |
| Ordering | **Per-audience** — order_position on the join table |
| Deletion policy | **Auto-archive** audience-exclusive items when audience is deleted |
| Groups | **Audience-local groups** — separate from global site groups |
| Referenced items | **Read-only** for audience-admins (edits to original propagate everywhere) |
| Media access | **Full** — audience-admins can browse and upload |
| Analytics | **Tracked separately** — new `audience_visit` event type |
| Promotion | **Admin/super-admin only** — audience-exclusive content can be promoted to site views |

### Content Visibility Rules

This is the core principle of the feature:

1. **Existing site content** can be *referenced* into an audience — it remains visible on site views AND becomes visible in the audience. No ownership change.
2. **New content created inside an audience** starts with `sites = []` — it is **only visible within that audience**. It does NOT appear on any site view.
3. **Promotion**: An admin or super-admin can *promote* audience-exclusive content to site views by assigning site slugs to it. Once promoted, the item appears on both the audience and the assigned site views. **Audience-admins cannot promote content** — this is a privileged operation.
4. **Demotion**: An admin or super-admin can remove site assignments from a promoted item, returning it to audience-exclusive status.

| Content origin | `sites` value | Visible on site views | Visible in audience | Who can change `sites` |
|----------------|---------------|----------------------|--------------------|-----------------------|
| Created on site feed | `['manastur']` | Yes | Yes (if referenced) | admin, super-admin |
| Created in audience | `[]` (exclusive) | **No** | Yes | admin, super-admin only (promote) |
| Promoted from audience | `['manastur', 'centru']` | Yes | Yes | admin, super-admin only |

---

## Phase 1: Database Schema & Migration

### Migration: `packages/api/src/db/migrations/0006_audiences.sql`

```sql
-- Audiences table
CREATE TABLE IF NOT EXISTS audiences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  accent_color  TEXT NOT NULL DEFAULT '#3b82f6',
  bg_color      TEXT NOT NULL DEFAULT '#0a0a0a',
  logo_url      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audience-local groups
CREATE TABLE IF NOT EXISTS audience_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id     UUID NOT NULL REFERENCES audiences(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  order_position  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audience_groups_audience_idx ON audience_groups (audience_id);

-- Audience <-> Content Items join table (reference model + per-audience ordering)
CREATE TABLE IF NOT EXISTS audience_content_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id       UUID NOT NULL REFERENCES audiences(id) ON DELETE CASCADE,
  content_item_id   UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  order_position    INTEGER NOT NULL DEFAULT 0,
  audience_group_id UUID REFERENCES audience_groups(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(audience_id, content_item_id)
);
CREATE INDEX aci_audience_idx ON audience_content_items (audience_id);
CREATE INDEX aci_content_item_idx ON audience_content_items (content_item_id);

-- User <-> Audience assignments (for audience-admin role)
CREATE TABLE IF NOT EXISTS user_audiences (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audience_id UUID NOT NULL REFERENCES audiences(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, audience_id)
);

-- Analytics: add audience_slug column
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS audience_slug TEXT;
CREATE INDEX analytics_events_audience_idx ON analytics_events (audience_slug, occurred_at);
```

### Drizzle Schema: modify `packages/api/src/db/schema.ts`

Add 4 new table definitions (`audiences`, `audienceGroups`, `audienceContentItems`, `userAudiences`) and add `audienceSlug` column to existing `analyticsEvents` table.

### Shared Types: modify `packages/shared/src/index.ts`

Add `Audience`, `AudienceGroup`, `AudienceContentItem` interfaces and `UserRole` type.

---

## Phase 2: API Layer

### 2.1 Extract shared guards

**New file:** `packages/api/src/routes/admin/guards.ts`

Currently `adminOnly` and `superAdminOnly` are duplicated across 6+ route files. Extract to shared module and add:
- **`audienceAdminOrAbove`** — allows `super-admin`, `admin`, or `audience-admin`
- **`canManageAudience(audienceId)`** — factory that checks `user_audiences` assignment for `audience-admin` role

Refactor existing route files (`content.ts`, `groups.ts`, `media.ts`, `analytics.ts`, `users.ts`, `sites.ts`, `logs.ts`) to import from this shared module.

### 2.2 Audience CRUD

**New file:** `packages/api/src/routes/admin/audiences.ts`

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| GET | `/admin/audiences` | audienceAdminOrAbove | List audiences (filtered for audience-admin) |
| POST | `/admin/audiences` | adminOnly | Create audience (validate slug uniqueness + reserved words) |
| GET | `/admin/audiences/:id` | audienceAdminOrAbove + assignment | Get single audience |
| PATCH | `/admin/audiences/:id` | adminOnly | Update audience settings |
| DELETE | `/admin/audiences/:id` | adminOnly | Delete audience (auto-archive exclusive items) |

**Reserved slugs** (block at creation): `admin`, `api`, `health`, `uploads`, `icons`, `v`, and all existing site slugs (checked dynamically).

**Deletion logic**: Before deleting, find items with `sites = '{}'` that are only in this audience (not in any other audience). Set their `state = 'archived'`. Then delete the audience (FK cascades clean up join tables).

### 2.3 Audience content management

**New file:** `packages/api/src/routes/admin/audience-content.ts`

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| GET | `/admin/audiences/:audienceId/content` | assignment | List items with join data, ordered by order_position |
| POST | `/admin/audiences/:audienceId/content` | assignment | Add existing item(s) by ID (`{ contentItemIds: string[] }`) |
| POST | `/admin/audiences/:audienceId/content/create` | assignment | Create new exclusive item (sites=[], auto-linked) |
| DELETE | `/admin/audiences/:audienceId/content/:contentItemId` | assignment | Remove from audience (archive if exclusive) |
| PUT | `/admin/audiences/:audienceId/content/order` | assignment | Reorder items (`{ order: string[] }`) |
| PATCH | `/admin/audiences/:audienceId/content/:contentItemId` | assignment | Update group assignment on join row |
| POST | `/admin/audiences/:audienceId/content/:contentItemId/promote` | **adminOnly** | Promote: set `sites` on the content item (makes it visible on site views). Body: `{ sites: string[] }`. Rejects if caller is `audience-admin`. |
| POST | `/admin/audiences/:audienceId/content/:contentItemId/demote` | **adminOnly** | Demote: reset `sites` to `[]` (returns item to audience-exclusive). Rejects if caller is `audience-admin`. |

### 2.4 Audience-local groups

**New file:** `packages/api/src/routes/admin/audience-groups.ts`

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| GET | `/admin/audiences/:audienceId/groups` | assignment | List groups ordered by order_position |
| POST | `/admin/audiences/:audienceId/groups` | assignment | Create group |
| PATCH | `/admin/audiences/:audienceId/groups/:groupId` | assignment | Update title |
| PUT | `/admin/audiences/:audienceId/groups/order` | assignment | Reorder groups |
| DELETE | `/admin/audiences/:audienceId/groups/:groupId` | assignment | Delete (items ungrouped via ON DELETE SET NULL) |

### 2.5 User-audience assignments

**Modify:** `packages/api/src/routes/admin/users.ts`

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| GET | `/admin/users/:id/audiences` | superAdminOnly | List user's assigned audiences |
| PUT | `/admin/users/:id/audiences` | superAdminOnly | Set audience assignments (replace all) |

Also: accept `'audience-admin'` as valid role in POST, include `audiences[]` in list response.

### 2.6 Public audience endpoint

**New file:** `packages/api/src/routes/audience.ts`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/content/audience/:slug` | Returns audience metadata (name, colors, logo) + published items (per-audience order, grouped by audience_groups, date-filtered) |

Same date/expiry/state filters as existing `/content` endpoint.

### 2.7 Analytics extensions

**Modify:** `packages/api/src/routes/events.ts`
- Accept `'audience_visit'` event type with `audienceSlug` field
- Store in `audience_slug` column

**Modify:** `packages/api/src/routes/admin/analytics.ts`
- New endpoint: `GET /admin/analytics/audience/:audienceId` (audienceAdminOrAbove + assignment check)

### 2.8 Auth token update

**Modify:** `packages/api/src/routes/auth.ts`

For `audience-admin` users, include `audiences: string[]` (assigned audience IDs) in JWT payload and `/auth/me` response. Avoids extra API round-trip on frontend.

### 2.9 Register routes

**Modify:** `packages/api/src/index.ts`

Register new route modules under `/api` prefix:
- `adminAudiencesRoutes`
- `adminAudienceContentRoutes`
- `adminAudienceGroupsRoutes`
- `audienceRoutes`

---

## Phase 3: Admin Frontend

### 3.1 API client extensions

**Modify:** `packages/app/src/admin/api/client.ts`

- Add `Audience`, `AudienceGroup` interfaces
- Add `api.audiences.*` methods (CRUD, content, groups, analytics)
- Extend `User` interface with `audiences?: string[]`
- Add `api.audiences.content.promote(audienceId, contentItemId, sites)` and `api.audiences.content.demote(audienceId, contentItemId)`
- Add `api.users.getAudiences()` and `api.users.setAudiences()`

### 3.2 Admin navigation

**Modify:** `packages/app/src/admin/AdminApp.tsx`

- Add **"Audiențe"** nav link — visible to `super-admin`, `admin`, and `audience-admin`
- Add routes: `audiences` and `audiences/:audienceId/*`
- For `audience-admin`: hide "Conținut", "Locații", "Utilizatori", "Jurnale"; show "Audiențe", "Media", "Statistici"
- Default redirect for `audience-admin` → `/admin/audiences` (instead of `/admin/content`)

### 3.3 Audiences list page

**New file:** `packages/app/src/admin/pages/AudiencesListPage.tsx`

- Lists audiences the user can manage (API auto-filters for audience-admin)
- Cards: color swatch, name, slug (`/v/{slug}`), edit/delete buttons
- Create form (admin/super-admin only): name, slug (auto-generated from name, editable), accent color picker, bg color picker, logo upload
- Delete: confirmation dialog with warning about auto-archiving exclusive items

### 3.4 Audience detail page

**New file:** `packages/app/src/admin/pages/AudienceDetailPage.tsx`

Sub-router with tabs:
1. **Conținut** (default) — the "view builder" content management
2. **Grupuri** — audience-local group management
3. **Setări** — edit name/slug/colors/logo (admin/super-admin only)
4. **Statistici** — audience-specific visit analytics

### 3.5 Audience content manager (the "view builder")

**New file:** `packages/app/src/admin/components/AudienceContentManager.tsx`

Core features:
- **Add existing items**: picker/search showing all published content items; already-added items marked
- **Create exclusive item**: same ContentForm as main page, creates with `sites = []`, auto-linked
- **Remove**: deletes join row; warning if item is audience-exclusive (will be archived)
- **Reorder**: DnD via `@dnd-kit` (same pattern as `ContentPage.tsx`), updates join table `order_position`
- **Group assignment**: drag items into audience-local groups
- **Read-only indicator**: lock icon on site-scoped items; edit disabled for `audience-admin`
- **Promote/Demote** (admin/super-admin only): audience-exclusive items show a "Promovează" button that opens a site-picker dialog. Selecting sites promotes the item to those site views. Already-promoted items show site circles and a "Retrage" (demote) button to return them to audience-exclusive. These buttons are **hidden for audience-admin users**.

Supporting components:
- `packages/app/src/admin/components/AudienceContentPicker.tsx` — modal for adding existing items
- `packages/app/src/admin/components/AudienceGroupManager.tsx` — audience-local group CRUD
- `packages/app/src/admin/components/AudienceSettingsForm.tsx` — audience settings edit form

### 3.6 Users page update

**Modify:** `packages/app/src/admin/pages/UsersPage.tsx`

- Add `'audience-admin'` to `ROLES` constant
- When role is `audience-admin`: show audience assignment picker (multi-select checkboxes)
- Display assigned audiences as pills on existing audience-admin users

### 3.7 Content page indicators

**Modify:** `packages/app/src/admin/pages/ContentPage.tsx`

Show small audience indicator pills on items referenced by audiences (analogous to existing site circles). Requires the admin content list API to include audience references via LEFT JOIN.

---

## Phase 4: Public PWA

### 4.1 Router

**Modify:** `packages/app/src/App.tsx`

Add route: `<Route path="/v/:audienceSlug" element={<AudiencePage />} />`

### 4.2 Audience page

**New file:** `packages/app/src/public/pages/AudiencePage.tsx`

- Fetches `GET /api/content/audience/:slug`
- Renders audience header (logo, name) with audience theming (accent + bg colors via CSS custom properties)
- Reuses existing `ContentRenderer` and `GroupBlock` components
- Tracks `audience_visit` event on page load (30min session throttle)
- No site switcher — audiences are independent of sites
- 404/empty state for nonexistent audience slugs

### 4.3 Tracking

**Modify:** `packages/app/src/public/api/track.ts`

Add `'audience_visit'` event type with `audienceSlug` param. Session dedup via localStorage key `betel-track-visit-audience-{slug}`.

---

## Phase 5: Cypress E2E Tests

### `cypress/e2e/admin-audiences.cy.ts`
1. Super-admin sees "Audiențe" nav link and navigates to list
2. Create audience with name/slug/colors — verify it appears in list
3. Edit audience settings — verify update
4. Delete audience — verify removal
5. Audience-admin sees only assigned audiences
6. Audience-admin cannot create/delete audiences

### `cypress/e2e/admin-audience-content.cy.ts`
1. View audience content list
2. Add existing items to audience via picker
3. Create new exclusive item within audience
4. Remove item from audience
5. Reorder audience content (verify API call with correct order)
6. Audience-admin sees lock icon on site-scoped items (read-only)
7. Admin promotes audience-exclusive item to site views — verify sites are set, item now visible on site feed
8. Admin demotes a promoted item back to audience-exclusive — verify sites reset to []
9. Audience-admin does NOT see promote/demote buttons

### `cypress/e2e/admin-audience-groups.cy.ts`
1. Create audience-local group
2. Delete group — items become ungrouped
3. Reorder groups

### `cypress/e2e/admin-audience-admin-role.cy.ts`
1. Audience-admin nav: only "Audiențe", "Media", "Statistici" visible
2. Audience-admin default redirect → `/admin/audiences`
3. Super-admin creates user with audience-admin role and assigns audiences
4. Audience-admin can access Media page

### `cypress/e2e/audience-public.cy.ts`
1. Visit `/v/tineri` — renders audience name, accent color, content
2. Content grouped by audience-local groups
3. Visit `/v/nonexistent` — 404/empty state
4. `audience_visit` event sent on page load
5. CSS custom properties match audience's theme colors

---

## Files Summary

### New files (18)

| File | Purpose |
|------|---------|
| `packages/api/src/db/migrations/0006_audiences.sql` | DB migration |
| `packages/api/src/routes/admin/guards.ts` | Shared auth guards (extracted + new) |
| `packages/api/src/routes/admin/audiences.ts` | Audience CRUD API |
| `packages/api/src/routes/admin/audience-content.ts` | Audience content management API |
| `packages/api/src/routes/admin/audience-groups.ts` | Audience-local groups API |
| `packages/api/src/routes/audience.ts` | Public audience content API |
| `packages/app/src/admin/pages/AudiencesListPage.tsx` | Admin: audiences list |
| `packages/app/src/admin/pages/AudienceDetailPage.tsx` | Admin: audience detail (tabs) |
| `packages/app/src/admin/components/AudienceContentManager.tsx` | Admin: content builder |
| `packages/app/src/admin/components/AudienceContentPicker.tsx` | Admin: add existing content |
| `packages/app/src/admin/components/AudienceGroupManager.tsx` | Admin: local groups |
| `packages/app/src/admin/components/AudienceSettingsForm.tsx` | Admin: audience settings |
| `packages/app/src/public/pages/AudiencePage.tsx` | Public audience page |
| `cypress/e2e/admin-audiences.cy.ts` | Tests: audience CRUD |
| `cypress/e2e/admin-audience-content.cy.ts` | Tests: audience content |
| `cypress/e2e/admin-audience-groups.cy.ts` | Tests: audience groups |
| `cypress/e2e/admin-audience-admin-role.cy.ts` | Tests: role permissions |
| `cypress/e2e/audience-public.cy.ts` | Tests: public page |

### Modified files (14)

| File | Changes |
|------|---------|
| `packages/api/src/db/schema.ts` | Add 4 tables + audienceSlug column on analyticsEvents |
| `packages/api/src/index.ts` | Register 4 new route modules |
| `packages/api/src/routes/auth.ts` | Include audiences in JWT for audience-admin |
| `packages/api/src/routes/events.ts` | Accept audience_visit + audienceSlug |
| `packages/api/src/routes/admin/content.ts` | Import guards from shared module; audience indicators |
| `packages/api/src/routes/admin/groups.ts` | Import guards from shared module |
| `packages/api/src/routes/admin/users.ts` | Audience assignment endpoints + audience-admin role |
| `packages/api/src/routes/admin/analytics.ts` | Audience-specific analytics endpoint |
| `packages/shared/src/index.ts` | New types (Audience, AudienceGroup, etc.) |
| `packages/app/src/admin/api/client.ts` | API methods + Audience interfaces |
| `packages/app/src/admin/AdminApp.tsx` | Nav + routes + role-based visibility |
| `packages/app/src/admin/pages/UsersPage.tsx` | audience-admin role + assignment UI |
| `packages/app/src/admin/pages/ContentPage.tsx` | Audience indicator pills on content rows |
| `packages/app/src/App.tsx` | `/v/:audienceSlug` route |
| `packages/app/src/public/api/track.ts` | audience_visit tracking |

---

## Verification Plan

1. **DB**: Run migration, verify tables exist in psql (`\dt audiences`, `\dt audience_*`, `\dt user_audiences`)
2. **API**: curl/Postman tests for all endpoints — CRUD, content management, groups, auth
3. **Admin UI**:
   - Login as super-admin → create audience → add content → verify builder works
   - Create audience-admin user → assign audiences → login → verify scoped access
   - Verify DnD reordering persists correctly
4. **Public PWA**: Visit `/v/{slug}` → verify theming, content, grouping, analytics event in DB
5. **Cypress**: Run full suite — 5 new test files + existing tests pass (regression check)
6. **Edge cases**:
   - Create audience with slug matching existing site → rejected
   - Create audience with slug "admin" → rejected
   - Delete audience with exclusive items → items archived
   - Audience-admin tries to edit site-scoped item → blocked (read-only)
   - Audience-admin tries to promote content → blocked (API returns 403, button hidden in UI)
   - Promote audience-exclusive item → verify it appears on public site feed
   - Demote promoted item → verify it disappears from public site feed but remains in audience
   - Audience-admin tries to access `/admin/content` → redirected to `/admin/audiences`

## Implementation Order

Phases should be executed sequentially (each depends on previous), but within each phase work can be parallelized:

1. **Phase 1** (DB) — no dependencies, start here
2. **Phase 2** (API) — guards module first (2.1), then all routes in parallel
3. **Phase 3** (Admin) — API client (3.1) first, then pages in parallel
4. **Phase 4** (Public) — depends only on public API endpoint (2.6); can overlap with Phase 3
5. **Phase 5** (Tests) — can be written alongside Phases 3-4 (they use API mocks/intercepts)
