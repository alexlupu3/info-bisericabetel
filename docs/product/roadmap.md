# Roadmap

## Phase 1 — Launch
- **Goal:** a working public hub and admin tool covering all core requirements
- **Deliverables:**
  - Public PWA: single-page content hub with per-site filtering, site switcher, preference persistence
  - Four content types: Card, Richtext, Poster, Embedded YouTube Video
  - Groups (Cards and Posters), drag-and-drop ordering, site scoping
  - Auto-expiry, draft/published/archived publishing states
  - Admin tool: content management, site management, ~~media library~~ **[done — 2026-03-17]**, preview mode, audit log
  - Admin accounts: super-admin provisioning flow, forced password change on first login, ~~password reset~~ **[done — 2026-03-21]** (super-admin resets admin passwords via UI; temp password shown once for out-of-band delivery)
  - **Admin email notifications (planned — no release date):** temporary passwords delivered by email on account creation (FR-030); self-service forgot-password / reset-password flow with time-limited email links (FR-031). Requires Resend integration and one-time DNS setup (SPF/DKIM). See `docs/architecture/integrations.md`.
  - ~~Analytics dashboard: site visits, link clicks, by location, lifetime + daily views~~ **[done — 2026-03-19]**
  - Per-site QR code / deep links
  - ~~Internationalization (i18n) — multi-language public hub~~ **[done — 2026-04-19]** Romanian default + English; language switcher in footer; UI string translations and content/group field translations; super-admin Translations page; localStorage-based preference persistence; Romanian fallback when translations are absent; zero query overhead for default locale
- **Risks:**
  - Sunday morning traffic spike requires scalable architecture from day one
  - Drag-and-drop ordering across groups needs careful UX design on mobile

## Phase 2 — Near Future
- **Goal:** extend reach and reduce friction for content creation

### Profile-based views
- Church-goer profile types (youth, family, elderly, leaders, etc.) as a second filtering dimension alongside site.
- A profile-based view hides content not relevant to that profile group.
- This is distinct from site filtering — profiles are about who the person is, not which campus they attend.
- Content items will need to support audience/profile scoping in addition to site scoping.

### External API & integration layer
- Expose a subset of admin functionality (e.g. create/update content items) via API key authentication.
- Enables integration with 3rd party automation tools such as Zapier (e.g. create a Card draft from a Google Calendar event).
- Also intended to support an MCP (Model Context Protocol) server so an AI agent can create and manage content via chat.
- API key management must be part of the super-admin tooling.

## Phase 3 — Future / Out of Scope for Now

### In-app form builder
- Replace external Google Form links with context-aware forms built and hosted within the app.
- Forms should know which site and profile the user is on to simplify data collection.
- Users should be able to complete forms without leaving the app.
- Current workaround: curated links pointing to Google Forms.

### Push notifications (PWA)
- Two notification types:
  1. **Event reminder:** user opts in to be reminded about a specific dated content item.
  2. **New content alert:** admin-triggered notification for new content added to a site, with admin controls to prevent notification spam for minor changes.
- Dependent on PWA push notification support being sufficiently mature across target devices.
