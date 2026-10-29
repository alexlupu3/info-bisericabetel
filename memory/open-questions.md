# Open Questions

Purpose: track unresolved questions that block product or technical decisions, plus known leftovers awaiting cleanup. Resolved questions are removed once their answer is recorded in `docs/` (the resolution notes below point to where).

## Questions
- Question: If a future content type stores images under a JSONB field name other than `imageUrl` or `thumbnail`, the media usage detection query in `GET /api/admin/media` and `DELETE /api/admin/media/:id` must be updated. Is there a plan to centralize this or enforce a naming convention?
  Owner: repository owner
  Status: OPEN
  Context: Current usage detection scans `data->>'imageUrl'` (Poster) and `data->>'thumbnail'` (Card). Any new image-bearing content type that deviates from these names will appear as "not in use" even when actively referenced, making it deletable and causing broken images. See ADR-003.

- Question: Group site scoping (BR-005) is documented but not enforced by `GET /api/content` (FR-008). Build the server-side filter, or drop group `sites` from the admin and the domain model?
  Owner: repository owner
  Status: OPEN
  Context: group `sites` are stored and editable in the admin (FR-026) and shown as a hint on the group header, so admins may believe the scope is applied. See `docs/domain/content-model.md` → "Compound Site Scope".

- Question: Which of the known security gaps should be fixed before more admins are onboarded?
  Owner: repository owner
  Status: OPEN
  Context: no rate limit on `POST /api/auth/login` and `POST /api/setup`; `mustChangePassword` enforced only in the SPA (FR-021); audit coverage gaps against FR-023 (group create/update/reorder, content reordering, admin user create/delete, site edits, admin-UI media upload/delete). Details and mitigations: `docs/architecture/security.md` → "Known risks".

## Known Issues
- None currently.

## Known Leftovers
- Orphaned `/admin/groups` route: `packages/app/src/admin/AdminApp.tsx` still registers `groups` → `GroupsPage` (`packages/app/src/admin/pages/GroupsPage.tsx`), although group management moved to the Content page (ADR-002) and the route is not linked from the navigation. Decision: remove the route and `GroupsPage`. Status: TO DO (not an open question any more).
- Archived-item filter (FR-016) and site creation (FR-019) are specified but not implemented; see `docs/product/requirements.md`.
- Vite dev proxy forwards only `/api`, `/robots.txt`, `/sitemap.xml` (spec 03), `/feed.xml`, `/:siteSlug/feed.xml` and `/llms.txt` (spec 02), so `/uploads/*` and `/s/:code` do not work on `:5173` (`packages/app/vite.config.ts`; see `docs/architecture/overview.md` → "Development and Testing"). Extending the proxy to those prefixes is a small, unscheduled improvement.

## Resolved (answers recorded in docs)
- Remote `/mcp` parity with the REST path — shared contract + service layer, ADR-024 (spec 05, 2026-10-29): one tool contract in `packages/shared/src/mcp-tools.ts`, analytics and short-link logic in services shared with REST, `/mcp` secret compared in constant time and rate-limited. Card/media rules remain re-implemented until migrated to services.
- Permanent delete erasing an item's analytics events and audit history — intended behaviour, confirmed by the repository owner 2026-10-17 (see `docs/architecture/security.md` → Audit requirements, `docs/domain/content-model.md`).
- MCP thumbnail URLs, `/mcp` upload body limit, BR-013 tie order on create and the remote `create_card` group re-sort — fixed 2026-10-17 (see ADR-015 → Update History, BR-013).
- Exact church sites — dynamic, admin-managed, seeded by migration (see `docs/domain/entities.md` → Site).
- QR codes / direct links — per-site deep links `/<siteSlug>` with an all-sites switch (FR-003, FR-004).
- Content ownership — multiple admins plus a super-admin; content changes audit-logged, with known gaps listed in FR-023 (Roles in `docs/product/requirements.md`, FR-023).
- Group site scope at creation and post-creation (C-1), sites fetched from `GET /api/sites` (C-2), group scope precedence (C-3 → BR-005), group header site hint (C-4) — see FR-026 and `docs/domain/content-model.md`.
