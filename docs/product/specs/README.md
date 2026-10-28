# Feature Specs — Coordination

Implementation-ready specs for the next batch of features, written so that each one can be handed to a different developer and built in parallel. This file is the **contract between the specs**: ownership of shared concerns, reserved IDs and the interfaces one spec provides to another. When a spec and this file disagree, this file wins until it is amended.

Specs live in this folder until they are implemented. Each spec proposes its edits to the shared docs (requirements, domain, architecture, ADR index) in its own "Doc integration" section; those edits are applied in one pass by the coordinator, never by the individual specs, so that parallel work never touches the same file.

## Specs

| # | Spec | Owner area | FR range | ADR range | Migration (provisional) |
|---|------|-----------|----------|-----------|-------------------------|
| 1 | [01-pwa.md](01-pwa.md) — real PWA: manifest, splash, icons, install invite, push notifications, staged rollout | PWA / service worker / push | FR-050 – FR-059 | ADR-019, ADR-020 | `0013` |
| 2 | [02-rss-feed.md](02-rss-feed.md) — RSS feed of current and upcoming events, AI-agent discoverability | Feeds, `llms.txt` | FR-060 – FR-064 | ADR-021 | none expected |
| 3 | [03-seo.md](03-seo.md) — crawlers enabled, SEO, structured data / rich results | Crawlability, `<head>` meta, sitemap, per-item pages | FR-065 – FR-074 | ADR-022 | `0015` (optional, site address fields) |
| 4 | [04-event-hours.md](04-event-hours.md) — optional start time for single-day events | Content model (event time) | FR-075 – FR-079 | ADR-023 (only if needed) | none expected (JSONB) |
| 5 | [05-mcp-analytics-short-links.md](05-mcp-analytics-short-links.md) — MCP tools for analytics and short-link creation | MCP (stdio + remote) | FR-080 – FR-084 | ADR-024 (only if needed) | none expected |
| 6 | [06-short-link-previews.md](06-short-link-previews.md) — link-preview metadata for short links, redirect as fallback | Short-link route | FR-085 – FR-089 | ADR-025 | `0014` (only if needed) |
| 7 | [07-event-location.md](07-event-location.md) — optional free-text event location on cards, shown under the date/time with a map-pin glyph | Content model (event location) | FR-090 – FR-094 | none (ADR-026 unused) | none expected (JSONB) |

Business rules: each spec uses its own BR block — 1 → BR-020–024, 2 → BR-025–029, 3 → BR-030–034, 4 → BR-035–039, 5 → BR-040–044, 6 → BR-045–049, 7 → BR-050–054 (BR-054 reserved, unused) (BR-015–019 left free for unplanned work).

Numbering notes: FR-049 and ADR-018 are taken by the SQL console, merged to `main` in PR #18 (migration `0012_sql_console_role.sql`); ADR-017 and BR-015 are taken by `fix/timezone-handling` (timezone policy, `services/time.ts`, `app/dates.ts`), merged to `main` in PR #17; spec 4 builds on it. Migration numbers are provisional — whoever merges second renumbers to the next free file (see `AGENTS.md` → Database migrations).

## Ownership of shared concerns

One owner per concern. A non-owner spec **consumes** the concern by referencing the owner's spec, and never redefines it.

| Concern | Owner | Consumers |
|---|---|---|
| `PUBLIC_BASE_URL` env var and the `absoluteUrl(path)` helper (`packages/api/src/services/public-url.ts`) used to build every absolute URL (canonical, OG image, feed links, sitemap, short-link URLs) | 3 SEO | 1, 2, 5, 6 |
| Server-side injection of per-page `<head>` metadata into the SPA's `index.html` (title, description, canonical, hreflang, Open Graph, Twitter, JSON-LD) for `/` and `/:siteSlug` | 3 SEO | — |
| Hub share name (`og:site_name`) and the default/brand share image used when a page or item has no image | 3 SEO | 6 (short-link preview fallbacks) |
| `robots.txt`, `sitemap.xml`, removal of any `noindex` / bot blocking | 3 SEO | 2 (feed URLs may be listed in `robots.txt` as comments only via 3) |
| Static `<head>` tags in `packages/app/index.html`: SEO tags belong to 3; PWA tags (`manifest`, `theme-color`, `apple-mobile-web-app-*`, `apple-touch-icon`, `apple-touch-startup-image`) belong to 1; the `<link rel="alternate" type="application/rss+xml">` tags belong to 2 (rendered through 3's injection mechanism when they are per-site) | split as listed | — |
| Web app manifest, icons, splash screens, service worker config (`vite.config.ts` `VitePWA` block), including `navigateFallbackDenylist` | 1 PWA | 2, 3, 6 must list their server-rendered paths in their spec; 1 adds them to the denylist |
| Install invite, push subscriptions, notification sending, the beta-tester / global rollout switch | 1 PWA | — |
| "What is an event" and "which events are current and upcoming" — a content item with `data.startDate` that has not ended yet (in-progress multi-day events included), filtered by the existing Expiration Behavior in `docs/domain/content-model.md` | existing domain docs (unchanged) | 1, 2, 3, 5 |
| Event start time: field `data.startTime`, string `HH:mm`, 24h, Europe/Bucharest wall-clock time, allowed only when `data.startDate` is set and the event is single-day (no `endDate`, or `endDate == startDate`). Plus the shared formatter for "when" text and the ISO-8601 date-time builder (with Bucharest offset) | 4 Event hours | 1 (notification text), 2 (`pubDate`/item text), 3 (JSON-LD `startDate`), 5 (MCP create/update tools), 6 (preview description fallback) |
| Short-link data model and redirect route `/s/:code`, including the crawler/preview response and any new preview fields | 6 Short-link previews | 5 (MCP `create_short_link` must accept 6's optional fields — 5 documents the tool with today's fields and names 6's additions as a follow-up delta owned by 6) |
| Event location: field `data.location` on Cards — optional free text, trimmed, max 70 characters, translatable per locale like the other text fields; rendering as its own row with a map-pin glyph below the date/time row | 7 Event location | 1 (notification body), 2 (feed `where` line / `ev:location`), 3 (JSON-LD `Event.location` `Place.name`), 5 (MCP card tools), 6 (preview description fallback) |
| MCP tool surface (`packages/mcp/src/index.ts`, `packages/api/src/routes/mcp.ts`, and the shared tool-definition file `packages/shared/src/mcp-tools.ts` proposed by 5) | 5 MCP | 4 adds `startTime` and 7 adds `location` to the card tools, 6 adds `previewMode` to `create_short_link` — small deltas in their own specs, landing after 5's shared contract |
| New `analytics_events.event_type` values (e.g. PWA install, notification open) | the spec that emits them (1) | 5 exposes analytics generically, so new types appear without MCP changes |
| Server-side "visible items / current and upcoming events" query, extracted from `routes/content.ts` into `packages/api/src/services/public-content.ts` (`listPublicContent`, `selectUpcomingEvents`) | 2 RSS | 3 (JSON-LD `Event`), 1 (notifications may reuse) |
| Public i18n keys file `packages/app/src/public/i18n/keys.ts`: append-only, each spec uses its own prefix (`pwa.` for 1, `feed.` for 2, `seo.` for 3, `event.` for 4, `location.` for 7) | shared, append-only | 1, 2, 3, 4, 7 |
| `vite.config.ts` `server.proxy` entries for server routes in dev (`/feed.xml`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, plus the existing server paths `/s` and `/uploads`) | 1 PWA (adds them with the denylist) | 2, 3, 6 |
| Admin content edit form (dates section) | 4 Event hours | 7 adds the location input directly below it |
| Public card date/time row | 4 Event hours | 7 adds the location row directly below it, as its own component |
| Admin short-link UI | 6 Short-link previews | — |
| Short-link admin REST handlers: 5 moves them out of `packages/api/src/routes/short-links.ts` into `routes/admin/short-links.ts` on top of a `services/short-links.ts` service; `routes/short-links.ts` then holds only the public `/s/:code` route, owned by 6 | 5 (admin handlers + service), 6 (`/s/:code`) | 6 adds its preview fields to 5's service/admin route as a delta |
| Admin rollout switch for PWA install invite / notifications | 1 PWA | — |

Server routes outside the SPA that need a service-worker denylist entry (1 adds them): `/s/*` (exists), `/robots.txt`, `/sitemap.xml` (3), `/feed.xml`, `/*/feed.xml`, `/llms.txt` (2).

## Fixed contracts

- **Absolute URLs:** `PUBLIC_BASE_URL` (e.g. `https://info.bisericabetel.com`, no trailing slash). Defined and documented by 3; required in production for 2, 3, 5, 6. Production refuses to start without it; in development it defaults to `http://localhost:3100` with a startup warning (see 03-seo.md FR-066), so `absoluteUrl()` always returns an absolute URL.
- **Event time:** `data.startTime` as above. Absent means "all day / time unknown"; consumers must render date-only in that case.
- **Event location:** `data.location` as above (Cards only, ≤ 70 characters, translated value with Romanian fallback). Absent means "no explicit location"; consumers then fall back to their current behaviour (e.g. the site as the place). When present it takes precedence over the site as the human-readable place name. Helpers in `packages/shared/src/event-location.ts` (`LOCATION_MAX_LENGTH = 70`, `normalizeLocationText`, `invalidLocation`, `readLocation`); length is measured in UTF-16 code units after normalisation. Admin copy is "Loc de desfășurare" — never "Locație", which already means a church site.
- **Feed URLs:** `/feed.xml` (all sites) and `/:siteSlug/feed.xml` (one site). 2 may add query parameters (e.g. language) but not change these paths.
- **Preview image of a content item:** Card → `data.thumbnail`, Poster → `data.imageUrl` (locale overrides per `content-model.md`); 6 defines the full fallback chain in `packages/api/src/services/preview-image.ts` (incl. 1200×630 JPEG derivatives under `/uploads/og/`) and 3/2 reuse it by reference.
- **Per-item pages:** `/i/:itemId` is a public SPA route owned by 3 (Google `Event` rich results need one URL per event). It is the canonical link for a single item: 2 uses it as the feed item `<link>`, 1 uses it as the notification click target, 6 may use it as `og:url` fallback. It is **not** added to the service-worker denylist: server-rendered HTML (ADR-022) serves first loads, crawlers and clients without a service worker, while navigations controlled by the service worker get the precached shell for `/`, `/:siteSlug` and `/i/:itemId` alike and the SPA fetches the data. Only server-only routes are denylisted.
- **`noindex` policy** is owned by 3; 6 applies `X-Robots-Tag: noindex` inside `/s/:code`.
- **Sites are data** — no spec hard-codes site slugs, names, cities or accent colours (see `AGENTS.md`).

## Delivery order

Most lanes start on day one; these are the hard sequencing constraints:

1. **`fix/timezone-handling` is merged to `main` (PR #17) — done** (ADR-017, BR-015, `services/time.ts`, `app/dates.ts`); spec 4 and the push sender in spec 1 build on it.
2. **Foundations, early in their own specs:** 3's `PUBLIC_BASE_URL` + `absoluteUrl()` (needed by 1, 2, 5, 6), 4's `packages/shared/src/event-time.ts` (needed by 1, 2, 3), 2's `services/public-content.ts` (needed by 1, 3), 6's `services/preview-image.ts` (needed by 2, 3), 3's `/i/:itemId` route (needed by 1, 2 for links), 5's `services/short-links.ts` + `routes/admin/short-links.ts` split (needed by 6's admin delta). Each spec's work breakdown marks these as its first tasks; a consumer that gets ahead may ship a stub with the owner's exact signature.
3. **Cross-spec deltas land after their base:** the `null`-deletes-key path in the remote `update_card` is needed by 4 and 7 — whichever lands first adds it; 7's card row and admin input after 4's (same files: the public card component and the admin content form); 4's `startTime`, 7's `location` and 6's `previewMode` additions to `packages/shared/src/mcp-tools.ts` after 5's shared tool contract; 2's per-site `<link rel="alternate">` after 3's `registerHeadTags()` hook.
4. **Migrations:** 1 → `0013`, 6 → `0014`, 3 → `0015` (optional). Renumber on merge if the order differs.

## Integration of shared docs

Applied now (on the specs branch): the planned FRs in `docs/product/requirements.md` → "Planned Features", the roadmap entry, and the ADR index rows (status Proposed).

Applied **with the code**, by the implementing developer: every other "Doc integration" snippet (domain rules, BR entries, entities, configuration, security, overview, deployment, user flows, amendments to existing FRs). Those docs describe the as-built system, so they change only when the behaviour does. When a feature ships, move its FRs out of "Planned Features" into the permanent section, set its ADRs to Accepted, and delete the spec (git history keeps it).

## Spec template

Every spec uses these sections, in this order:

1. **Summary** — the problem and the outcome, in a few sentences.
2. **Goals / Non-goals**
3. **Current state** — what exists today, with file references.
4. **User flows** — public visitor, admin, and (where relevant) crawler / AI agent.
5. **Requirements** — numbered with the reserved FR IDs, each testable.
6. **Design** — data model, API, UI, configuration (new env vars), security and privacy, performance and caching.
7. **Contracts** — what this spec provides to and consumes from others (must match the tables above).
8. **Rollout** — flags, migration, deploy order, rollback.
9. **Testing** — Cypress happy flow and regression scenarios, plus the manual checks for backend behaviour the suite does not cover.
10. **Work breakdown** — tasks sized for one developer each, with the files each task touches and their dependencies.
11. **Open questions** — decisions the product owner must make, each with a recommended default.
12. **Doc integration** — the exact additions this spec proposes for shared docs (`requirements.md`, `content-model.md`, `business-rules.md`, `configuration.md`, `security.md`, `roadmap.md`, `user-flows.md`, ADR index). Written as ready-to-paste snippets; not applied by the spec author.
