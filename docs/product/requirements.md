# Product Requirements

## Functional Requirements

### Public Hub
- FR-001: The public-facing hub is a single scrollable page. Content is displayed in the exact order defined by admins, at both root level and within groups. Groups show their title with their items rendered beneath them.
- FR-002: The public hub is a PWA (Progressive Web App) — installable on mobile, no authentication required.
- FR-003: Each church site has its own QR code and direct link that pre-filters the hub to that site's content. Users can switch to an all-sites view at any time.
- FR-004: A subtle inline link allows users to switch views. When on a site-specific view the link reads "view all" and switches to all-sites. When on the all-sites view the link reads "view site..." and opens a popup listing all available sites.
- FR-005: The app must persist the user's last selected site preference locally (e.g. local storage). On return visits without a site URL, the remembered preference is loaded. A URL-encoded site always takes precedence over the stored preference.

### Content Model
- FR-006: The system must support four base content types: Card, Richtext, Poster, and Embedded YouTube Video (see content-model.md for fields).
- FR-007: Cards and Posters may be grouped into Groups. Only one level of nesting is allowed — no groups inside groups.
- FR-008: All content items and groups must support site scoping (visible on one site, multiple sites, or all sites). Site scoping only shows or hides items — it never changes their order. **[Implemented]** Groups support site scope selection at creation time (via checkboxes in the "+ Grup nou" form) and post-creation editing (via the expand-panel edit form on the group header). When a group is scoped to specific sites, the entire group container is hidden for excluded sites regardless of individual item site assignments (see BR-005).
- FR-009: All content items and groups must support manual ordering via drag and drop. Admins manage a single global ordered list and can move any item to any position, including between groups. Items can be dragged across group boundaries (multi-container drag and drop); a visual drag ghost (DragOverlay) is shown during the drag operation. Root-level order is persisted via a dedicated root-order API that accepts both standalone items and groups. Within-group order is persisted separately for the affected group(s). When an item moves between containers, the system also updates that item's `groupId`.
- FR-010: All content types support automatic expiry via two independent mechanisms. (1) **JSONB date fields (unified):** all four content types support optional `startDate` and `endDate` in their JSONB `data` column. The public API and admin past-item logic apply date filtering uniformly: `endDate` takes precedence; fallback to `startDate`; no JSONB dates = no filtering from this path. The admin form uses progressive disclosure — end date is hidden until a start date is set. (2) **`expiresAt` column (independent):** a separate per-row expiration timestamp that applies independently of the JSONB fields; both mechanisms are evaluated and either alone is sufficient to hide an item. For past-item detection in the admin, JSONB dates take precedence over `expiresAt`. **[Implemented — migration 0005_migrate_card_date.sql promoted legacy `data.date` → `data.startDate` on existing cards]**
- FR-011: The content type system must be extensible — new types must be addable without restructuring the existing system.

### Publishing
- FR-012: Every content item must have one of three publishing states: draft, published, or archived.
- FR-013: Draft items are not visible on the public hub. Published items are live. Archived items are not visible on the public hub.
- FR-014: When an item's expiry date passes, it must be automatically transitioned to archived state.

### Admin Tool — Content Management
- FR-015: The admin tool is a separate web application from the public PWA, with its own entry point, login, and independent build bundles.
- FR-016: Archived items are hidden from the default admin content list but accessible via a filter.
- FR-017: Images must be uploaded directly to the server. A media library allows admins to browse and reuse previously uploaded images. **[Implemented]** Every upload is recorded in the `media` table. The admin Media page (`/media` route) provides a gallery view with filter tabs (all / in use / not in use), per-image usage attribution (content item name/title), and a delete action for unused images. Delete is blocked server-side (HTTP 409) if the image is still referenced by any content item. See ADR-003.
- FR-028: Poster content items must support an optional admin-only `name` field (stored in `data.name`, never shown publicly) to provide a human-readable identifier for use in the media library usage view. **[Implemented]**
- FR-018: The admin tool must provide a preview mode that renders the public hub view (including draft items) for a selected site.
- FR-026: Group management is fully integrated into the Content page. Groups are displayed as visual container sections with a header showing the group title, assigned sites (as a text hint when sites are set), and action buttons. A "+ Grup nou" button on the Content page allows creating new groups inline; the creation form includes a title field and site-scope checkboxes (sites default to empty = all sites). An "Editează" button on each group header expands an inline edit panel pre-filled with the current title and site assignments, allowing post-creation editing; saving issues PATCH /admin/groups/:id. Clicking the group title directly is an equivalent shortcut to open the same edit panel. A "Șterge grup" button on each group header deletes that group (items auto-migrate to ungrouped). There is no separate Groups page in the admin navigation. Items without a group are shown in an "Fără grup" (ungrouped) section. Content item names are also clickable — clicking the item name opens the inline edit form for that item, equivalent to the "Editează" context menu action. **[Implemented]**
- FR-027: The content create/edit form retains a group dropdown selector as a convenience field, allowing an admin to assign or reassign an item's group while editing it.
- FR-029: Each group on the Content page must be individually collapsible/expandable via a chevron toggle on its header. When collapsed, the group's item list is hidden and the group cannot receive dropped items. The drag handle remains active so collapsed groups can be reordered. A "toggle all groups" button in the page header collapses all groups at once (or expands all if all are already collapsed); this button is only shown when at least one group exists. Collapse state is session-local and non-persistent. **[Implemented]**

### Admin Tool — Site & Account Management
- FR-019: Only the super-admin can create or update church sites (name, address, accent color, and other info fields). Sites must not be hardcoded in the codebase. Each site has a configurable accent color used to apply a distinct visual theme on its public hub view. The all-sites view uses a neutral default theme.
- FR-020: The super-admin must be able to create admin accounts by providing a username and temporary password. **[Planned enhancement — FR-030]** Once email sending is implemented, the temporary password must be sent to the new user via email rather than displayed in the UI.
- FR-021: Admins must be prompted to change their password on first login.
- FR-022: The super-admin must be able to trigger a password reset for any admin account at any time. **[Implemented]** `POST /admin/users/:id/reset-password` (super-admin only) generates a 10-char alphanumeric temporary password, hashes it with bcryptjs (salt 12), sets `must_change_password = true`, and returns `{ tempPassword }` to the super-admin for out-of-band communication. Only `admin`-role users are eligible — super-admin accounts cannot have their password reset by another super-admin to prevent privilege abuse. The action is recorded in the audit log (`action: 'reset_password'`, `entityType: 'user'`, `detail.targetEmail`). The Admin UI shows a "Resetează parola" button per eligible user row; on success the temporary password is displayed in a panel (same pattern as new user creation). **[Planned enhancement — FR-031]** Once email sending is implemented, password resets will also be handleable via a self-service forgot-password flow.
- FR-030: **[Planned — no release date]** When a super-admin creates a new admin account, the system must send the temporary password to the new user via email. The temporary password must not be displayed in the admin UI. Requires email service integration (see `docs/architecture/integrations.md`).
- FR-031: **[Planned — no release date]** The system must support a self-service password reset flow for admin users. A "Forgot password" link on the login page triggers an email containing a time-limited reset link. Clicking the link opens a "Reset password" page in the Admin SPA. Backend: new `password_reset_tokens` table (`id`, `userId`, `token`, `expiresAt`) and two new endpoints — `POST /auth/forgot-password` and `POST /auth/reset-password`. Requires email service integration (see `docs/architecture/integrations.md`).

### Audit & Analytics
- FR-023: The system must maintain an audit log recording who changed what and when for all content and configuration changes.
- FR-024: The system must track site visits and link clicks, recording which church site the event originated from. **[Implemented]** Events are ingested via `POST /events` (public, no auth) and written asynchronously (fire-and-forget). The `analytics_events` table records: id, event_type (`site_visit` | `link_click`), site_slug, item_id, url, occurred_at. The PWA tracks site visits in `HomePage.tsx` (deduped per 30-minute window via `localStorage` key `betel-track-visit-{site}`) and link clicks in `CardItem.tsx` and `PosterItem.tsx` onClick handlers on the outer `<a>` wrapper; all tracking is fire-and-forget via `packages/pwa/src/api/track.ts`. When a Card or Poster has a `link`, the entire item (`<article>`) is wrapped in an `<a>` tag making the whole surface clickable — for Cards the inner CTA is rendered as a styled `<span>` (not a nested `<a>`); hover styles (translate-y, bg shift) are applied at the outer wrapper level.
- FR-025: The admin analytics dashboard must provide a lifetime report and a daily report for site visits and link clicks. **[Implemented]** Two admin-only endpoints exist: `GET /admin/analytics/lifetime` returns aggregated totals `{ total: { visits, clicks }, bySite: [{ slug, visits, clicks }] }`; `GET /admin/analytics/daily?days=30` returns a daily breakdown `{ daily: [{ date, visits, clicks }], days }` (max 90 days). The `AnalyticsPage.tsx` admin page (`/analytics` route, accessible to all authenticated admins) displays stat cards for lifetime totals, a per-site breakdown table, and a daily activity table defaulting to the last 30 days. The page is linked in the main admin nav bar as "Statistici".

## Non-Functional Requirements
- NFR-001: Both the public hub and the admin tool must be optimized for mobile-first access.
- NFR-002: The application must minimize friction for first-time visitors opening a shared link or scanned QR code.
- NFR-003: The information architecture must stay clear even when content spans multiple church sites.
- NFR-004: No translation or i18n system is required. Content is displayed in the language it was written. The admin UI is in English.
- NFR-005: The system must handle traffic spikes on Sunday mornings (thousands of concurrent users). Baseline weekday traffic is in the hundreds. Sunday morning is the critical availability window.
- NFR-006: The public hub must load fast on mobile devices including on slower connections. Performance optimization (minimal bundle size, efficient image loading, caching) is a first-class concern.
- NFR-007: No formal WCAG compliance level required, but the app must follow healthy HTML5 standards (semantic markup, meaningful alt text, logical heading structure).
- NFR-008: No vendor lock-in. The system must run on a standard Linux VPS without proprietary dependencies. Database must be swappable via ORM/connector configuration.
- NFR-009: The codebase must be structured for long-term maintainability — dependency upgrades and new features must not require full-app refactors.

## Roles
- **Church member / attendee:** read-only access to the public hub
- **Admin:** authenticated; can create, edit, publish, and archive any content item on any site
- **Super-admin:** all admin capabilities plus site management, admin account creation, and password resets

## Acceptance Notes
- What must be true for launch?
  - Members can open the app from QR codes or direct links
  - Members can see content, filter by site, and view all content
  - Admins can manage content with full draft/publish/archive workflow
  - Super-admin can manage sites and admin accounts
  - Audit log and analytics dashboard are operational
- What can wait for later phases?
  - Profile-based views (youth, family, elderly, leaders) — Phase 2
  - External API / integration layer (Zapier, MCP) — Phase 2
  - In-app form builder — Phase 3
  - Push notifications — Phase 3
