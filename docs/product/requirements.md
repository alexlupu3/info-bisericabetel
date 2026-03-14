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
- FR-008: All content items and groups must support site scoping (visible on one site, multiple sites, or all sites). Site scoping only shows or hides items — it never changes their order.
- FR-009: All content items and groups must support manual ordering via drag and drop. Admins manage a single global ordered list and can move any item to any position, including between groups.
- FR-010: All content types support automatic expiry. For Richtext, Poster, and Embedded YouTube Video: explicit optional expiration date. For Cards: end date takes priority; if only a start date is set, that is the expiry; no dates means permanent. Expired items are auto-archived.
- FR-011: The content type system must be extensible — new types must be addable without restructuring the existing system.

### Publishing
- FR-012: Every content item must have one of three publishing states: draft, published, or archived.
- FR-013: Draft items are not visible on the public hub. Published items are live. Archived items are not visible on the public hub.
- FR-014: When an item's expiry date passes, it must be automatically transitioned to archived state.

### Admin Tool — Content Management
- FR-015: The admin tool is a separate web application from the public PWA, with its own entry point, login, and independent build bundles.
- FR-016: Archived items are hidden from the default admin content list but accessible via a filter.
- FR-017: Images must be uploaded directly to the server. A media library allows admins to browse and reuse previously uploaded images.
- FR-018: The admin tool must provide a preview mode that renders the public hub view (including draft items) for a selected site.

### Admin Tool — Site & Account Management
- FR-019: Only the super-admin can create or update church sites (name, address, accent color, and other info fields). Sites must not be hardcoded in the codebase. Each site has a configurable accent color used to apply a distinct visual theme on its public hub view. The all-sites view uses a neutral default theme.
- FR-020: The super-admin must be able to create admin accounts by providing a username and temporary password.
- FR-021: Admins must be prompted to change their password on first login.
- FR-022: The super-admin must be able to trigger a password reset for any admin account at any time.

### Audit & Analytics
- FR-023: The system must maintain an audit log recording who changed what and when for all content and configuration changes.
- FR-024: The system must track site visits and link clicks, recording which church site the event originated from.
- FR-025: The admin analytics dashboard must provide a lifetime report and a daily report for site visits and link clicks.

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
