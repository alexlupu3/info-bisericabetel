# Roadmap

## Phase 1 — Launch
- **Goal:** a working public hub and admin tool covering all core requirements
- **Deliverables:**
  - Public PWA: single-page content hub with per-site filtering, site switcher, preference persistence
  - Four content types: Card, Richtext, Poster, Embedded YouTube Video
  - Groups (Cards and Posters), drag-and-drop ordering, site scoping
  - Auto-expiry (expired items hidden from the public hub), draft/published/archived publishing states
  - Admin tool: content management, site management (edit only — site creation not built, FR-019), ~~media library~~ **[done — 2026-03-17]**, audit log **[partially implemented — FR-023]**
  - Preview mode (FR-018) — **not implemented**; not currently scheduled
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

### Profile-based views — deferred indefinitely / current approach rejected
> The detailed Audiences plan is kept for reference and must not be deleted. Implementing it as separate public pages (`/v/{slug}`) is deferred indefinitely, because it adds a new destination users have to discover and disproportionate operational complexity. A better solution is needed: one integrated into the existing single hub, without separate pages and without making users search in a second place for information.

- Church-goer profile types (youth, family, elderly, leaders, etc.) as a second filtering dimension alongside site.
- A profile-based view hides content not relevant to that profile group.
- This is distinct from site filtering — profiles are about who the person is, not which campus they attend.
- Content items will need to support audience/profile scoping in addition to site scoping.

### External API & integration layer
- ~~MCP (Model Context Protocol) server~~ **[done — 2026-05-13]**: AI agent can create and manage card content via chat using `packages/mcp/` (`@betel/mcp`). Stdio transport (authenticates with the admin REST API using email+password JWT) plus a remote `/mcp` endpoint in the API (Bearer `MCP_SECRET`). 8 tools: `list_sites`, `list_groups`, `list_media`, `list_cards`, `create_card`, `update_card`, `publish_card`, `upload_media`. See FR-048, ADR-012, ADR-015 and `docs/architecture/integrations.md`.
- ~~**MCP analytics and short links**~~ **[done — 2026-10-29]:** `get_analytics_overview`, `get_item_stats`, `get_top_items`, `get_short_link_stats`, `create_short_link`, `list_short_links` on both surfaces (14 tools); shared tool contract (ADR-024). FR-080–FR-084.
- **API key layer [pending]:** expose admin functionality via API key authentication. Required for Zapier integration and as the proper long-term auth mechanism for machine clients including the stdio MCP server. API key management must be part of the super-admin tooling. The stdio MCP server currently uses JWT auth (and the remote endpoint a shared `MCP_SECRET`) as a temporary measure until this is built.

### Next feature batch [specified — 2026-10-28]
Seven specs (five shipped) for parallel implementation; ownership, reserved IDs and delivery order in [`specs/README.md`](specs/README.md).
- **Real PWA** — complete manifest/icons/splash, platform-aware install invite, opt-in push for new events, staged rollout (`off` → `beta` → `all`). [01-pwa.md](specs/01-pwa.md), FR-050–FR-059.
- ~~**RSS event feed**~~ **[done — 2026-10-29]** — RSS feed of current and upcoming events at `/feed.xml` and `/:siteSlug/feed.xml` (`?lang=`, ETag/304), `/llms.txt` for AI agents, `<link rel="alternate">` discovery. FR-060–FR-064, ADR-021, BR-025, BR-026. Follow-ups not scheduled: JSON Feed (`/feed.json`), a `published_at` column for `pubDate`, feed-fetch analytics, a W3C Feed Validator run against production.
- ~~**SEO & crawlability**~~ **[done — 2026-10-28]** — server-rendered metadata, content snapshot and inline data, JSON-LD (`WebSite`/`Organization`/`Church`/`Event`/`ItemList`), per-item pages `/i/:itemId`, `robots.txt`, `sitemap.xml`, structured site addresses, `woff2` fonts. FR-065–FR-074, ADR-022, BR-030. Follow-ups not scheduled: Lighthouse median for FR-073, indexing other languages (`?lang=` + `hreflang`, ADR-014 amendment), a settings table instead of `SEO_*` env vars, Search Console / Google Business Profile steps after deploy.
- ~~**Event start time**~~ **[done — 2026-10-28]** — optional `HH:mm` on single-day events, FR-075–FR-079, ADR-023. Follow-ups not scheduled: end time / duration, times on multi-day events, admin list showing dates and times, calendar (`.ics`) export.
- ~~**MCP analytics & short links**~~ **[done — 2026-10-29]** — `get_analytics_overview`, `get_item_stats`, `get_top_items`, `get_short_link_stats`, `create_short_link`, `list_short_links` on both surfaces; shared tool contract (`packages/shared/src/mcp-tools.ts`) and service layer; `/mcp` hardened (constant-time secret, rate limit). FR-080–FR-084, ADR-024, BR-040, BR-041. Follow-ups not scheduled: migrate the card/media tools to services, MCP `structuredContent`, `delete_short_link` and vanity codes (both deferred to the API key layer), per-item view tracking.
- **Short-link previews** — messaging apps show the content's title and image; destination preview kept as fallback. [06-short-link-previews.md](specs/06-short-link-previews.md), FR-085–FR-089.
- ~~**Event location**~~ **[done — 2026-10-29]** — optional free-text venue on cards (`data.location`, ≤ 70 characters), translatable, shown under the date with a map pin, MCP `location` field, used by the RSS feed and structured data. FR-090–FR-094, BR-050–BR-053.

## Phase 3 — Future / Out of Scope for Now

### In-app form builder
- Replace external Google Form links with context-aware forms built and hosted within the app.
- Forms should know which site and profile the user is on to simplify data collection.
- Users should be able to complete forms without leaving the app.
- Current workaround: curated links pointing to Google Forms.

### Push notifications (PWA) — reminders and manual alerts
- **Event reminder:** user opts in to be reminded about a specific dated content item.
- **Manual content alert:** admin-triggered notification for new content added to a site, with admin controls to prevent notification spam for minor changes.
- Automatic new-event alerts are no longer in this phase: they moved to Phase 2 → "Next feature batch" ([01-pwa.md](specs/01-pwa.md), FR-055), which also delivers the push infrastructure these two types will reuse.
