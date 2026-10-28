# 03 — Crawlers enabled, SEO and structured data for the public hub

Spec #3 of the batch described in [README.md](README.md). Owner area: crawlability, `<head>` metadata, structured data, `robots.txt`, `sitemap.xml`, `PUBLIC_BASE_URL` / `absoluteUrl()`. FR-065 – FR-074, ADR-022. Documentation only — nothing in this file has been implemented.

## 1. Summary

The public hub (`/` and `/:siteSlug`) is a client-rendered React SPA whose server response contains no content, no description, no canonical URL and no structured data. The product owner believed crawlers were explicitly blocked; the audit below shows they are not — the site is simply empty to anything that does not execute JavaScript, and under-described to Google, which does. The goal is to make the public hub fully indexable and rich-result eligible: server-rendered `<head>` metadata and JSON-LD built from live data (sites → `Church`, dated items → `Event`), a server-rendered HTML snapshot of the feed so non-JS crawlers and AI agents can read it, per-item pages so events have the unique URLs Google requires, `robots.txt`, `sitemap.xml`, and a Core Web Vitals / semantic-HTML pass. The spec also states honestly what is and is not in our control for the query "biserica betel cluj info", and defines the shared `PUBLIC_BASE_URL` + `absoluteUrl()` contract consumed by specs 1, 2 and 6.

## 2. Goals / Non-goals

**Goals**

- Every public page is indexable by Google, Bing and non-JS crawlers (AI agents, link unfurlers) without executing JavaScript: title, description, canonical, Open Graph, JSON-LD and the content feed itself are present in the server response.
- Rich-result eligibility for what Google actually supports today: `Event` (per-event pages), `Organization` / site name (`WebSite`), local entity data per site (`Church` with a postal address), and the EEA "things to do" carousel (`ItemList` of events). No work on features Google has withdrawn (see §3.4).
- `robots.txt` and `sitemap.xml` served by the API; admin, API, short-link and MCP routes stay out of the index.
- One canonical absolute-URL mechanism (`PUBLIC_BASE_URL`, `absoluteUrl()`) reused by the PWA, RSS and short-link-preview specs.
- Measurable Core Web Vitals targets on mobile and a semantic-HTML baseline on the public pages.
- Sites remain data: no slug, site name, city or colour is hard-coded by this spec.

**Non-goals**

- Full React server-side rendering with hydration (rejected in ADR-022; revisit if the hub grows beyond a one-page feed).
- Localised URLs / `hreflang` (locale is a client preference, ADR-014; see §6.6 and open question Q4).
- Rich results for Richtext, Poster and Video items beyond the generic page metadata (they have no supported rich-result type that applies).
- Guaranteeing a ranking position. Google does not guarantee rich results or positions; §6.8 lists what is in our control.
- The PWA manifest, service-worker denylist and PWA head tags (spec 01), RSS `<link rel="alternate">` and `llms.txt` (spec 02), the short-link preview response (spec 06), `data.startTime` and the ISO date-time builder (spec 04).

## 3. Current state

### 3.1 Crawler-blocking audit — nothing blocks crawlers today

| Checked | Result | Where |
|---|---|---|
| `robots.txt` | **Does not exist in the repo.** `packages/app/public/` holds only `fonts/` and `icons/`. In production `GET /robots.txt` hits the SPA fallback and returns `index.html` with HTTP 200 (`text/html`). Google treats an unparseable robots body as "no rules" (allow all); it is not a block, but it is sloppy and `sitemap.xml` behaves the same way. | `packages/api/src/index.ts:120-126` (`setNotFoundHandler`), verified live on `https://info.bisericabetel.com/robots.txt` on 2026-10-28 |
| `<meta name="robots">` | None. | `packages/app/index.html` |
| `X-Robots-Tag` header | None, on any route. | `packages/api/src/index.ts` (no header set anywhere; verified live: `/`, `/manastur`, `/admin` return no `X-Robots-Tag`) |
| Auth / gating on public routes | None. `GET /api/sites`, `GET /api/content`, `GET /api/languages`, `GET /api/translations` are public (`docs/architecture/security.md` → Authorization → Public). | `packages/api/src/routes/sites.ts`, `content.ts`, `languages.ts` |
| Service worker | Registered with `registerType: 'autoUpdate'`; `navigateFallbackDenylist: [/^\/admin/, /^\/s\//]`. Crawlers never run a service worker, so it neither blocks nor helps them. It does mean an installed PWA serves the *precached* `index.html` for navigations, which matters for the injection design (§6.3). | `packages/app/vite.config.ts:9-42` |
| Dockerfile / CapRover | No proxy rules, no headers, no `robots.txt` copied in. CapRover's nginx is managed by CapRover; nothing visible from outside adds a robots header. | `Dockerfile`, `captain-definition` |
| Git history | No commit ever added or removed `robots`, `noindex` or `X-Robots` (`git log -S` on all three terms returns nothing). | — |
| Google index | A web search for `"info.bisericabetel.com"` returns nothing from the domain. The page is not blocked; it is most likely unindexed because nothing links to it and it has no indexable signals. | search performed 2026-10-28 |

Conclusion: **there is no bot block to remove.** The work is to add the signals that make the pages worth indexing and readable without JavaScript. (If a block exists at the CapRover/nginx level or in a Search Console removal request, it is outside the repository — see Q2.)

Two unrelated observations from the live check, for the owners of ADR-013 / spec 01: the deployed build serves `index.html` with `cache-control: public, max-age=0` rather than the `no-cache` decided in ADR-013 (the live build predates it or the header is overwritten upstream), and the built HTML contains `<link rel="manifest">` twice (once from `index.html:8`, once injected by `vite-plugin-pwa`).

### 3.2 What the server actually returns for `/` and `/:siteSlug`

`packages/app/index.html` is served verbatim. It contains: `<html lang="ro">`, charset, viewport, two favicons, manifest, `theme-color`, the theme bootstrap script, two `apple-mobile-web-app-*` metas, `<title>Betel Info</title>`, Google Fonts preconnect/preload, and an empty `<div id="root"></div>`. There is no `<meta name="description">`, no `<link rel="canonical">`, no Open Graph / Twitter tags, no JSON-LD, no `<h1>` and no text.

Routing: `/` is served by `@fastify/static` (registered with `wildcard: false`, so the plugin registers a `/` route for the directory index — `node_modules/@fastify/static/index.js:134-167`); `/:siteSlug`, `/admin/*` and every other unmatched path are served by `setNotFoundHandler` (`packages/api/src/index.ts:120-126`), which sends the same file with `Cache-Control: no-cache`. **Any injection must therefore cover both code paths** (§6.3).

### 3.3 What the client renders

`packages/app/src/App.tsx:22-33` routes `/` and `/:siteSlug` to `HomePage` (`packages/app/src/public/pages/HomePage.tsx`). Semantics today:

- `<header>` with `<img src="/icons/favicon-dark.svg" alt="Betel logo" aria-hidden="true">` (an `alt` on an `aria-hidden` image is contradictory, lines 41-46) and an `<h1>` whose text is "BISERICA BETEL" or "BETEL {site.name}" (lines 47-54).
- `<main aria-label="Conținut">` (hard-coded Romanian attribute, line 78) containing the feed: `GroupBlock` renders `<section aria-label id={slugify(title)}><header><h2>…` (`GroupBlock.tsx:24-37`); `CardItem` renders `<article>` with `<h2>` title, a date line, Markdown description, and wraps the whole article in `<a target="_blank">` when it has a link (`CardItem.tsx:45-101`); card thumbnails have `alt=""` and no `width`/`height`/`loading` (`CardItem.tsx:48-56`); `PosterItem` images have `loading="lazy"`, `alt={d.alt ?? ''}`, no dimensions (`PosterItem.tsx:22-27`); `VideoItem` embeds a lazy YouTube iframe (`VideoItem.tsx:27-34`); `RichtextItem` renders Markdown inside `<article>` (`RichtextItem.tsx`).
- `<footer>` with the copyright line via `t(UI_KEYS.FOOTER_COPYRIGHT, 'Biserica Baptistă Betel · Cluj-Napoca')` (`HomePage.tsx:95`) — note that the church name and city already live in code as the Romanian fallback of a UI key, and in `vite.config.ts:12` (`description: 'Informații și evenimente — Biserica Baptistă Betel Cluj-Napoca'`).
- `document.title` is never set per site; it stays "Betel Info".
- `track('site_visit', …)` fires on every data load (`HomePage.tsx:29-31`, `public/api/track.ts`). Googlebot executes JavaScript, so once the site is crawled regularly, crawler visits will be counted as `site_visit` analytics events.

Data: `GET /api/content[?site=&locale=]` (`packages/api/src/routes/content.ts`) returns published, non-expired items ordered as in the admin, with `data.startDate` / `data.endDate` (`YYYY-MM-DD`) and, per spec 04, the future `data.startTime`. `GET /api/sites` returns `slug, name, accent, address, createdAt` (`sites.ts:6-9`; `address` is nullable free text, `schema.ts:3-9`). The public `Site` type in `packages/shared/src/index.ts:1-5` omits `address`.

### 3.4 What Google supports today (research, 2026-10-28)

Verified against Google Search Central documentation and blog posts:

- **Event** rich results are supported. Required: `name`, `startDate` (ISO-8601), `location` as a `Place` with a `PostalAddress`. Recommended: `location.name`, `description`, `endDate`, `eventStatus`, `image`, `organizer`, `offers`. Guidelines that bind us: events must be open to the public and take place at a physical location; **each event needs its own unique URL with the markup on that page — listing/schedule pages are explicitly not supported**; non-events (promotions, business hours, vouchers) must not be marked up as events. `eventAttendanceMode` is no longer discussed on the Event page (the former online/mixed-mode guidance was dropped; physical events are the only supported kind), so it is emitted as `OfflineEventAttendanceMode` only for completeness. ([Event structured data](https://developers.google.com/search/docs/appearance/structured-data/event))
- **Organization** structured data: no required properties; use the most specific `Organization` subtype; `logo` (≥112×112, crawlable) influences the logo in results and knowledge panels; put it on the home page only. `Church` / `PlaceOfWorship` are `Place` subtypes, not `Organization` subtypes, and **are not listed as eligible for the LocalBusiness rich result** (which accepts `LocalBusiness` subtypes only). So the church *organisation* is typed `Organization` and each *site* is a `Church` place with an address — valid schema.org, useful for entity understanding and AI answers, but there is no "church card" rich result to win from markup; the local pack is driven by Google Business Profile (§6.8). ([Organization](https://developers.google.com/search/docs/appearance/structured-data/organization), [Local business](https://developers.google.com/search/docs/appearance/structured-data/local-business))
- **Site name** (`WebSite` with `name`, `url`, optional `alternateName`, on the home page) is supported, and a subdomain gets its own site name. ([Site names](https://developers.google.com/search/docs/appearance/site-names))
- **Carousels (beta)** — `ItemList` + `Event` on a summary page is eligible for "things to do" queries **in the EEA** (Romania qualifies): at least three items, each with `image`, `name`, `url`, `position`; every URL must be a different page on the same domain; anchor links are not accepted. This is the only "list" rich result that applies to the hub, and it also requires per-item URLs. ([Carousels beta](https://developers.google.com/search/docs/appearance/structured-data/carousels-beta))
- **No longer supported / not controllable:** the sitelinks search box (removed November 2024); FAQ and HowTo rich results (restricted in August 2023); Book Actions, Course Info, Claim Review, Estimated Salary, Learning Video, Special Announcement, Vehicle Listing (deprecated June 2025); Practice Problems and Dataset (phased out later in 2025). Regular sitelinks are algorithmic — no markup influences them. Breadcrumb markup is still supported on desktop, but since January 2025 mobile results show only the domain instead of a breadcrumb trail, and our hierarchy is one level deep, so breadcrumbs are low value here. ([June 2025 deprecations](https://developers.google.com/search/blog/2025/06/simplifying-search-results), [Sitelinks search box removal](https://searchengineland.com/google-search-to-drop-sitelinks-search-box-447682), [Breadcrumb](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb))
- **JavaScript:** Googlebot renders with evergreen Chromium in a separate, delayed render phase; JSON-LD injected by JS is accepted; server-side or pre-rendering "is still a great idea" because "not all bots run JavaScript"; **dynamic rendering is a workaround, not a long-term solution** — Google recommends server-side rendering, static rendering or hydration instead. ([JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Dynamic rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)) Independent measurements (Vercel/MERJ, 2024-2025) found that no major AI crawler (GPTBot, ClaudeBot, PerplexityBot, Meta, ByteDance) executes JavaScript — they read the raw HTML only.
- **hreflang** requires a distinct, fully-qualified URL per language version, with bidirectional annotations. A single URL whose language is switched client-side cannot carry hreflang. ([Localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions))
- **Structured data policies:** markup must describe content visible on the page; JSON-LD is the recommended format; rich results are never guaranteed; a page may contain several items, linked with `@id`. ([General structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies))

## 4. User flows

### Flow A — Public visitor (unchanged experience, faster first paint)

1. Visitor opens `/` or `/:siteSlug` (QR code, link, search result). The server returns HTML that already contains the hero, the site name, and the content feed as plain semantic HTML, plus an inline JSON blob with the same data.
2. The React app boots, reads the inline data (no `/api/sites` + `/api/content` round-trip on first paint), and renders the interactive hub in place of the snapshot. If the visitor's stored locale is not Romanian, the app then fetches that locale's content as today.
3. Switching sites updates the URL (`useSite.selectSite`, `useSite.ts:40-49`), `document.title` and the canonical link client-side.
4. A visitor arriving from a Google event result lands on `/i/:itemId`, sees the item in its site context with a link to the full hub.

### Flow B — Admin

No new admin screens are required. Optional (task T8): the Locations page gains structured address fields (street, postal code, city, country, latitude/longitude, phone) so each site's `Church` markup has a complete `PostalAddress`. Editors keep writing content as today; a Card with a start date and a resolvable site automatically becomes an `Event` on its item page.

### Flow C — Crawler / AI agent

1. `GET /robots.txt` → allow everything except `/admin`, `/api/`, `/s/`, `/mcp`; `Sitemap:` line.
2. `GET /sitemap.xml` → `/`, every `/:siteSlug`, every `/i/:itemId` for published, current items; `lastmod` from `updatedAt`.
3. `GET /` → HTML with `<title>`, description, canonical, OG/Twitter, `WebSite` + `Organization` + `Church[]` + `ItemList` JSON-LD, and the readable feed.
4. `GET /:siteSlug` → same with the site's `Church`, the site-scoped feed and `ItemList`.
5. `GET /i/:itemId` → item page with `Event` JSON-LD when the item is a dated event; `noindex` when the item is not published or has expired (soft-404 avoidance).
6. `GET /admin/*`, `GET /s/:code` → `X-Robots-Tag: noindex`. `GET /api/*` → disallowed by robots.

## 5. Requirements

Status for all: **[Proposed]**.

- **FR-065 — Crawlability.** The API serves `GET /robots.txt` (`text/plain`, `Cache-Control: public, max-age=3600`) allowing all user agents on public paths and disallowing `/admin`, `/api/`, `/s/`, `/mcp`; it ends with `Sitemap: {PUBLIC_BASE_URL}/sitemap.xml`. No public page (`/`, `/:siteSlug`, `/i/:itemId`, `/uploads/*`) carries `noindex`. Responses for `/admin/*` carry `X-Robots-Tag: noindex, nofollow`; `/s/:code` responses carry `X-Robots-Tag: noindex` (implemented by spec 06 inside its route). Spec 02 may list feed URLs in `robots.txt` as comments only.
- **FR-066 — Public base URL.** `PUBLIC_BASE_URL` (origin without trailing slash) is the single source for absolute URLs. `absoluteUrl(path)` in `packages/api/src/services/public-url.ts` returns `PUBLIC_BASE_URL + path` for root-relative paths and passes absolute `http(s)` URLs through unchanged. In production the API refuses to start if `PUBLIC_BASE_URL` is missing or malformed; in development it defaults to `http://localhost:3100` with a startup warning. Documented in `configuration.md`.
- **FR-067 — Server-rendered page metadata.** For `GET /`, `GET /:siteSlug` (existing slug) and `GET /i/:itemId`, the HTML response contains, built from live data: a unique `<title>`, `<meta name="description">`, `<link rel="canonical">`, `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:image` (+ `og:image:width/height` when known), `og:locale`, `twitter:card`, and `<html lang>` equal to the default language code from the `languages` table. Unknown site slugs and unknown item ids respond with HTTP 404 and `<meta name="robots" content="noindex">` while still rendering the SPA shell (soft-404 avoidance).
- **FR-068 — Organisation and site structured data.** `GET /` embeds one JSON-LD `@graph` with `WebSite` (`name`, `alternateName[]`, `url`, `inLanguage`), `Organization` (`@id`, `name`, `url`, `logo`, `sameAs[]`, `location[]` → the sites) and one `Church` per site (`@id`, `name`, `url` = absolute `/:siteSlug`, `address` as `PostalAddress`, `geo` when coordinates exist, `telephone` when present, `parentOrganization` → the organisation). `GET /:siteSlug` embeds that site's `Church` (with `parentOrganization`) and a `WebPage` referencing it. Site data comes exclusively from the `sites` table.
- **FR-069 — Event structured data and item pages.** A new public route `/i/:itemId` renders one content item (client route in the SPA + server-rendered head/snapshot). When the item is a Card with `data.startDate` that is not past, the page embeds an `Event` with `name`, `startDate` (ISO date-time via spec 04's builder when `data.startTime` exists, else the bare date), `endDate` (when set), `description` (Markdown stripped to text), `image` (absolute thumbnail, per spec 06's preview-image chain), `url` (the item page), `eventStatus: EventScheduled`, `eventAttendanceMode: OfflineEventAttendanceMode`, `organizer` → the organisation, and `location` → the `Church` of the item's resolved site (rule in §6.2.3). Items without a resolvable physical location are not marked up as events (Google requires a `Place` with an address). `GET /` and `GET /:siteSlug` embed an `ItemList` of the same upcoming events (position, `url` → item page, `name`, `image`) when at least three exist; otherwise no `ItemList`.
- **FR-070 — Indexable without JavaScript.** The server response for `/`, `/:siteSlug` and `/i/:itemId` contains, inside `<div id="root">`, a semantic HTML snapshot of what the SPA renders for the default locale (hero `<h1>`, site switcher as plain links, groups as `<section>` + `<h2>`, items as `<article>` with headings, dates in `<time datetime>`, descriptions, links, images with `alt`), plus `<script id="betel-initial-data" type="application/json">` with the `sites`, `languages` and `content` payloads so the SPA renders without refetching. The SPA replaces the snapshot on mount. Content is HTML-escaped; no raw HTML from the database is emitted.
- **FR-071 — Sitemap.** `GET /sitemap.xml` (`application/xml`, `Cache-Control: public, max-age=600`) lists `/`, every `/:siteSlug`, and every `/i/:itemId` for items that `GET /api/content` would currently return in the all-sites view or any site view, each with `<lastmod>` (ISO date of `updatedAt`, or the newest item for hub pages). No `<priority>` / `<changefreq>` (ignored by Google).
- **FR-072 — Semantic HTML and accessibility baseline (NFR-007).** On public pages: exactly one `<h1>`; group titles `<h2>`, item titles `<h3>` inside groups and `<h2>` at root (no skipped levels); every `<img>` has an `alt` (decorative images use `alt=""` and no `aria-hidden` contradiction); every `<img>` in the feed has `width`/`height` or an aspect-ratio box and `loading="lazy"` except the first visible image; `<main>`, `<nav>` (site switcher), `<header>`, `<footer>` landmarks; `aria-label`s are translated via `t()`, not hard-coded; dates use `<time datetime="YYYY-MM-DD[THH:mm]">`.
- **FR-073 — Core Web Vitals budget.** On a mid-range mobile profile (Lighthouse "Moto G Power, slow 4G" or PageSpeed Insights mobile) `/` and `/:siteSlug` meet: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, with the initial HTML ≤ 60 KB gzipped (snapshot + inline data included). Measured before merge and recorded in the PR.
- **FR-074 — Search ownership signals.** The home page renders `<meta name="google-site-verification">` when `GOOGLE_SITE_VERIFICATION` is set; the operational checklist (Search Console property for `PUBLIC_BASE_URL`, sitemap submission, Google Business Profile website link to the hub, link from the main church website) is documented in `deployment.md` and executed once after deploy. Crawler visits are excluded from `site_visit` analytics (bot user agents and `navigator.webdriver` are skipped in `track()`).

## 6. Design

### 6.1 Configuration

| Variable | Required | Default | Read in | Purpose |
|---|---|---|---|---|
| `PUBLIC_BASE_URL` | Yes in production (`NODE_ENV=production`), otherwise optional | `http://localhost:3100` (dev only, with a warning) | `src/services/public-url.ts` | Public origin of the hub, e.g. `https://info.bisericabetel.com`. Scheme + host [+ port], **no path, no trailing slash**; trailing slashes are stripped, anything else malformed fails startup. Used for canonical URLs, `og:url`, `og:image`, JSON-LD `url`/`@id`, `sitemap.xml`, `robots.txt`, RSS links (spec 02) and short-link previews (spec 06). |
| `SEO_ORG_NAME` | No | `Biserica Baptistă Betel` | `src/services/seo/organization.ts` | Legal / display name of the church organisation for `Organization.name`, `og:site_name` and titles. The organisation (one church, many sites) is configuration; the sites are data. |
| `SEO_SITE_NAME` | No | `Betel Info` | same | `WebSite.name` and manifest-independent site name. `SEO_SITE_ALTERNATE_NAMES` (comma-separated, default `Info Biserica Betel`) feeds `WebSite.alternateName`. |
| `SEO_ORG_WEBSITE` | No | `https://www.bisericabetel.com` | same | `Organization.url` and first `sameAs`; today hard-coded in `HomePage.tsx:59`. |
| `SEO_ORG_SAME_AS` | No | unset | same | Comma-separated list of official profile URLs (Facebook, YouTube, Instagram, Wikipedia) for `Organization.sameAs`. |
| `SEO_ORG_LOGO_PATH` | No | `/icons/icon-512.png` | same | Path (resolved with `absoluteUrl`) of a crawlable PNG ≥112×112 for `Organization.logo` and the fallback `og:image`. |
| `SEO_DEFAULT_COUNTRY` | No | `RO` | same | ISO 3166-1 alpha-2 used for `PostalAddress.addressCountry` when a site row has no country (pre-migration fallback). |
| `GOOGLE_SITE_VERIFICATION` | No | unset | `src/services/seo/head.ts` | Renders the verification meta tag on `/` (alternative to DNS verification). |
| `SEO_CACHE_TTL_SECONDS` | No | `60` | `src/services/seo/cache.ts` | TTL of the in-memory rendered-page cache. `0` disables caching (dev). |

Rationale for env vars rather than a settings table: there is no settings table today, the values change once a year, and spec README expects no migration from this spec. If the owner prefers data over config (Q6), the same keys move to a `settings` table in a follow-up without changing the renderer.

### 6.2 Data model

#### 6.2.1 No schema change required (v1)

Everything in FR-065–FR-074 can be built from the existing tables. `sites.address` (free text) is emitted as `PostalAddress.streetAddress` with `addressCountry = SEO_DEFAULT_COUNTRY`; Google notes that a city alone is "not recommended", and a street line without a structured locality is weak but valid.

#### 6.2.2 Optional migration (task T8, provisional `0014_site_address_fields.sql`)

Adds nullable columns to `sites`: `street_address TEXT`, `postal_code TEXT`, `address_locality TEXT`, `address_region TEXT`, `address_country TEXT`, `latitude DOUBLE PRECISION`, `longitude DOUBLE PRECISION`, `telephone TEXT`, `email TEXT`. The free-text `address` stays as the human-readable label (and as `streetAddress` fallback). `schema.ts`, `PATCH /api/admin/sites/:slug` (`packages/api/src/routes/admin/sites.ts:17-35`), the Locations page (`packages/app/src/admin/pages/LocationsPage.tsx`) and the `Site` type in `packages/shared` are extended accordingly. **Coordination:** README lists spec 3 as "none expected"; `0012` and `0013` are reserved by specs 1 and 6, so this one is provisional `0014` and whoever merges second renumbers.

#### 6.2.3 Rules for deriving structured data from content

- **Upcoming event** = a content item returned by the public content query (`content.ts:39-54`: published, not expired, date filter) whose `type === 'card'` and `data.startDate` is set. Richtext, Poster and Video items with dates are *scheduled content*, not events (they have no title/description contract), and are never marked up as `Event`.
- **Event location** (which `Church` is `location`): the item's `exclusiveSite` if set; else, on a site page, that site; else, on `/` or `/i/:id`, the single entry of `sites[]` if it has exactly one; else **no `Event` is emitted** (an all-church event with no single physical place does not satisfy Google's `Place` requirement — the organisation address is not a substitute). The `ItemList` on `/` includes only events that pass this rule.
- **`startDate`**: `data.startTime` present → spec 04's ISO-8601 builder (Europe/Bucharest offset); absent → `YYYY-MM-DD`. `endDate` likewise from `data.endDate` (date-only unless spec 04 adds an end time). Date strings are validated (`/^\d{4}-\d{2}-\d{2}$/`) before use.
- **`image`**: spec 06's preview-image chain (Card → `data.thumbnail`, locale overrides, then organisation logo), made absolute with `absoluteUrl()`.
- **`description`**: Markdown stripped to plain text (headings, emphasis, links → text), collapsed whitespace, truncated at 300 characters on a word boundary for `<meta name="description">` and `og:description`; full text for JSON-LD.
- **Nothing hidden is marked up:** every property emitted is visible in the snapshot (title, date, description, site name/address in the item page footer). The item page shows the site's address line so `location.address` is visible.

### 6.3 Server-side rendering of head and snapshot (ADR-022)

Options compared — detail and consequences in [ADR-022](../../decisions/ADR-022-server-side-head-injection-and-content-snapshot.md):

| Option | What it is | Verdict |
|---|---|---|
| A. Head injection only | API string-injects `<title>`, metas and JSON-LD into `index.html`; body stays empty until JS runs | Necessary but insufficient: Google would index (after rendering), AI crawlers and previewers would still see an empty page; Event `description`/location would be "not visible on page" for non-JS fetchers. |
| B. Head injection + server-rendered HTML snapshot + inline data (**chosen**) | API renders a small, dependency-free HTML template of the feed into `#root` and inlines the JSON the SPA needs; React replaces the snapshot on mount (`createRoot().render()`, no hydration). | Content readable by every crawler; no second rendering stack (no `react-dom/server`, no Vite SSR build, no CSS-in-JS concerns); first paint and LCP improve (no API round-trip, no skeleton). Cost: two renderers for four content types that must stay in sync (guarded by a Cypress parity test and a shared field list). |
| C. Full React SSR + hydration | Vite SSR build of `packages/app`, `renderToString` in the API, `hydrateRoot` on the client | One renderer, best fidelity. Cost: the API bundle imports the app (esbuild + Vite SSR outputs, CSS/asset handling, `window`/`localStorage` guards in `useSite`/`LanguageContext`/`useTheme`, React Query dehydrate/hydrate), hydration mismatches when the stored site/locale/theme differ from the server guess. Disproportionate for a single-page feed; revisit if the hub gains real pages. |
| D. Prerender at build time | Static HTML generated during `vite build` | Content changes hourly without deploys; a build-time snapshot is stale by definition. Rejected. |
| E. Dynamic rendering / prerender service for bots | Serve a headless-Chrome snapshot to bot user agents | Google calls it a workaround, not a long-term solution; adds infrastructure (Chrome in the container or a third-party service) against the no-vendor-lock-in constraint; cloaking risk. Rejected. |

Mechanics (option B):

1. **Template loading.** At startup the API reads `dist/public/index.html` once (`PUBLIC_DIR`, `index.ts:38`) and splits it at three anchors: the existing `<title>…</title>` element (replaced), `</head>` (head block inserted before it) and `<div id="root"></div>` (replaced by `<div id="root">{snapshot}</div>` followed by the inline data script). No special markers in `index.html` are needed; a startup assertion fails loudly if an anchor is missing (guards against a Vite/plugin change).
2. **Routes.** Register explicit `GET /`, `GET /:siteSlug` and `GET /i/:itemId` handlers *before* the SPA static plugin, and set `index: false` on the SPA `@fastify/static` registration so `/` is no longer served as a directory index (`index.ts:60-82`). `/:siteSlug` must not shadow other top-level routes: Fastify's router prefers static routes (`/health`, `/robots.txt`, `/sitemap.xml`, `/feed.xml`, `/llms.txt`, `/mcp`, `/admin`) over the parametric one, and the handler returns the 404-shell for slugs that are not in `sites`. The `setNotFoundHandler` fallback stays for `/admin/*` (adds `X-Robots-Tag`) and other deep paths, serving the plain template.
3. **Page data.** `services/seo/page-data.ts` loads `sites`, enabled `languages` and the content list for the requested scope with the same query as `GET /api/content` (extract the query builder from `routes/content.ts` into `services/public-content.ts`, owned by spec 02 so both share it; default locale only). Items are grouped exactly as `HomePage.Feed` does (`HomePage.tsx:108-146`) and filtered with the same "is past" rule as the client (`public/api/filter.ts`).
4. **Renderers** (`services/seo/render-head.ts`, `render-snapshot.ts`, `structured-data.ts`): pure functions `(PageModel) → string` with a single `escapeHtml()` and a JSON-LD serialiser that escapes `<`, `>`, `&` and U+2028/2029 (`JSON.stringify` + replace), so database text can never close the `<script>` element. Inline data uses the same serialiser.
5. **Caching** (`services/seo/cache.ts`): in-memory `Map<path, { html, etag, expiresAt }>` with `SEO_CACHE_TTL_SECONDS`; strong `ETag` (SHA-1 of the HTML) and `If-None-Match` → 304. Response headers: `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-cache` (ADR-013 unchanged), `Vary: Accept-Encoding`. Sunday spike: at most one DB round-trip per path per TTL; everything else is memory. Admin writes may additionally call `seoCache.clear()` (cheap, optional).
6. **SPA side.** `main.tsx` reads `#betel-initial-data` (if present) and seeds React Query (`setQueryData` for `['sites']`, `['languages']`, `['content', site, 'ro']`) before rendering; when absent (precached `index.html` served by the service worker, or Vite dev) the app fetches as today. `HomePage` sets `document.title` and the canonical `href` on site change from the same title rules the server uses (rules live in `packages/shared/src/seo.ts` so both sides import one function).
7. **Dev parity.** In `pnpm dev` (Vite on 5173) there is no injection — the SPA behaves exactly as before. The injected output is verified against the API port or the Docker image (manual checks, §9.3).

### 6.4 Head metadata rules

Title/description builder in `packages/shared/src/seo.ts` (pure, used by API and SPA):

| Page | `<title>` | description |
|---|---|---|
| `/` | `{SEO_SITE_NAME} – {SEO_ORG_NAME}` → e.g. "Betel Info – Biserica Baptistă Betel" | `{heroSubtitle}` (the Romanian default of `UI_KEYS.HERO_SUBTITLE`) + " " + list of site names: "Locații: A, B, C." (names from `sites`) |
| `/:siteSlug` | `{site.name} – {SEO_ORG_NAME}` | "{heroSubtitle} Locația {site.name}{, address when set}." |
| `/i/:itemId` | `{item.title} – {site.name or SEO_ORG_NAME}` | item description (stripped, 300 chars) or, when empty, "{date line} · {site name}" |

The Romanian defaults of public UI keys (`HomePage.tsx`) are needed server-side; move them into `packages/shared/src/i18n-defaults.ts` (key → Romanian string) and have `keys.ts` / the components import the same object, so there is one source for the fallbacks. Other locales are not rendered server-side (§6.6).

`og:image`: on `/` and `/:siteSlug` the organisation logo (`SEO_ORG_LOGO_PATH`; spec 01 may provide a larger branded image — if it does, this spec consumes it by path); on `/i/:itemId` the item's preview image per spec 06's chain. `og:type`: `website` for hub pages, `article` for item pages. `og:locale`: BCP-47 of the default language mapped as in `LanguageContext.tsx:10-15` (`ro` → `ro_RO`).

### 6.5 JSON-LD shapes

Home page `@graph` (illustrative; all values from data/config):

```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": "{base}/#website", "url": "{base}/", "name": "{SEO_SITE_NAME}", "alternateName": ["…"], "inLanguage": "ro", "publisher": { "@id": "{base}/#organization" } },
    { "@type": "Organization", "@id": "{base}/#organization", "name": "{SEO_ORG_NAME}", "url": "{SEO_ORG_WEBSITE}", "logo": "{abs logo}", "sameAs": ["…"], "location": [ { "@id": "{base}/{slug}#place" } ] },
    { "@type": "Church", "@id": "{base}/{slug}#place", "name": "{SEO_ORG_NAME} {site.name}", "url": "{base}/{slug}", "address": { "@type": "PostalAddress", "streetAddress": "…", "addressLocality": "…", "postalCode": "…", "addressCountry": "RO" }, "geo": { "@type": "GeoCoordinates", "latitude": 0, "longitude": 0 }, "telephone": "…", "parentOrganization": { "@id": "{base}/#organization" } },
    { "@type": "ItemList", "itemListElement": [ { "@type": "ListItem", "position": 1, "url": "{base}/i/{id}", "name": "…", "image": "…" } ] }
  ]
}
```

Item page: `WebPage` (`isPartOf` → website, `about`/`mainEntity` → the `Event`) and the `Event` with `location` → `{ "@id": "{base}/{slug}#place" }` **expanded inline** (Google's validator needs the `Place` with its `address` on the same page, so the `Church` object is repeated on item pages, not only referenced). `geo`, `telephone`, `postalCode`, `addressLocality` are omitted when null (never empty strings).

### 6.6 Canonical, languages and hreflang

- Canonical is always `absoluteUrl(pathname)` without query string; `/:siteSlug` is its own canonical (it shows different content, it is not a duplicate of `/`).
- The site is indexed in the default language only. `<html lang>` = default language code from `languages`; no `hreflang` tags are emitted, because every language shares one URL (ADR-014) and Google requires a URL per language version. The `LanguageSwitcher` stays client-side. If the owner wants English pages indexed (Q4), the follow-up is a `?lang=xx` query parameter honoured by `LanguageContext` and the server renderer, with `hreflang` pairs `/` ↔ `/?lang=en` and canonical per variant — an amendment to ADR-014, not part of this spec.

### 6.7 Robots, sitemap and noindex

`robots.txt` (served from a route, not a static file, so it can include `PUBLIC_BASE_URL`):

```
User-agent: *
Disallow: /admin
Disallow: /api/
Disallow: /s/
Disallow: /mcp
# Feeds (spec 02): /feed.xml, /:siteSlug/feed.xml, /llms.txt
Sitemap: {PUBLIC_BASE_URL}/sitemap.xml
```

`/uploads/` is deliberately **not** disallowed: Event and OG images must be crawlable. AI crawlers are not blocked (the owner wants the content "easily extracted"); an allowlist/denylist for specific agents is a one-line change later.

`sitemap.xml`: generated per request from the same content query, cached like pages (`max-age=600`); fewer than 1 000 URLs are expected, so no sitemap index. Item URLs: every published, non-expired item visible in the all-sites view or in any site view (i.e. all items the content query returns for `site = null` plus exclusive items for each site).

`noindex`: `X-Robots-Tag: noindex, nofollow` on the `setNotFoundHandler` branch for paths starting with `/admin`; `<meta name="robots" content="noindex">` in the 404-shell for unknown slugs/items and for expired/unpublished items on `/i/:itemId` (HTTP 404 in that case; HTTP 410 when the item is `deleted`). Spec 06 adds `X-Robots-Tag: noindex` to `/s/:code`.

### 6.8 Ranking for "biserica betel cluj info": what is in our control

In our control (this spec): a crawlable, fast page whose title, `<h1>`, description and site name contain the brand ("Betel", `SEO_ORG_NAME`) and the city of each site through site data (`Church.address.addressLocality`) — not through hard-coded strings; `WebSite.alternateName` "Info Biserica Betel"; an `Organization` entity linked with `sameAs` to the church's existing profiles; per-event pages that can surface as event rich results and, in the EEA, an events carousel.

In the owner's control, outside the code (FR-074 checklist): verify the property in Google Search Console and submit the sitemap; add the hub's URL to the church's **Google Business Profile(s)** — the local pack / knowledge panel for "biserica betel cluj" is driven by GBP, not by markup; add a visible link to the hub from `www.bisericabetel.com` and from the church's social profiles (the subdomain currently has no inbound links); keep the site names consistent between GBP, the main website and `sites.name`.

Not in anyone's control: the position itself. "biserica betel cluj" is a brand query already owned by `www.bisericabetel.com`, Facebook and YouTube; the realistic target is for `info.bisericabetel.com` to rank first for the "info" variants and to appear as a sitelink/second result for the brand query, which Google decides algorithmically. Rich results are never guaranteed even when markup is valid.

### 6.9 Core Web Vitals and performance

Current risks: Google Fonts loaded through a `preload` + `onload` swap (`index.html:16-19`) — render-blocking-free but adds a third-party connection on the critical path; three local `.woff` (not `.woff2`) Franie fonts with `font-display: swap` (`index.css:6-26`) and no `preload` for the one used by the `<h1>` (LCP text can shift); card thumbnails without dimensions (`CardItem.tsx:48-56`) → CLS; the hero logo is an SVG without dimensions (`HomePage.tsx:41-46`); the first paint waits for `/api/sites` + `/api/content` → LCP.

Measures: inline initial data (removes two round-trips); `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the heading font actually used above the fold, after converting the Franie files to `woff2` (keep `.woff` as fallback); explicit `width`/`height` (or Tailwind `aspect-[16/9]` boxes, already used for cards) on every image; `fetchpriority="high"` and no `loading="lazy"` on the first feed image, `lazy` on the rest; `decoding="async"`; keep the admin chunk lazy (already, ADR-005). The snapshot adds ≈10–30 KB of HTML; budget ≤60 KB gzipped total (FR-073). INP: the site switcher and theme toggle are the only interactions; no change expected.

### 6.10 Security and privacy

- All text from the database is HTML-escaped in the snapshot; JSON-LD and inline data are serialised with `<`/`>`/`&`/U+2028/2029 escaped. Markdown is not rendered server-side (plain text), so no sanitiser is needed. The SPA's `react-markdown` continues to render Markdown without raw HTML.
- No visitor data is used server-side; the cache key is the path only (no cookies, no locale, no user agent). Robots/sitemap expose only already-public data.
- `PUBLIC_BASE_URL` is validated at startup; `absoluteUrl` never accepts a `//host` or `javascript:` path (root-relative paths must start with a single `/`).
- `/i/:itemId` must apply the same visibility rules as `GET /api/content` (published, not expired) — never expose drafts.

## 7. Contracts

> **Delta from spec 07 (event location):** this spec consumes `data.location` via `readLocation()` — see the ready-to-paste amendment for this spec in [07-event-location.md](07-event-location.md) §7 "Consumer deltas". Apply it with this spec's implementation.

**Provides**

- `PUBLIC_BASE_URL` and `absoluteUrl(path)` (`packages/api/src/services/public-url.ts`) — consumed by specs 01 (manifest/notification URLs), 02 (feed links), 06 (preview URLs/images). Signature: `absoluteUrl(path: string): string`; throws on non-root-relative, non-http(s) input.
- Server-side head injection for `/`, `/:siteSlug` (and `/i/:itemId`); a `headExtras` hook (`registerHeadTags(fn: (page: PageModel) => string[])`) lets spec 02 add its per-site `<link rel="alternate" type="application/rss+xml">` tags through this mechanism, as the README requires.
- `robots.txt` (spec 02's feed URLs appear as comments only) and `sitemap.xml`.
- Server-rendered paths that spec 01 must add to `navigateFallbackDenylist`: `/robots.txt`, `/sitemap.xml`. (`/`, `/:siteSlug`, `/i/:itemId` remain SPA navigations and must **not** be denylisted — offline/installed use keeps working through the precached shell.)
- A shared `packages/shared/src/seo.ts` (title/description builders) and `packages/shared/src/i18n-defaults.ts` (Romanian UI defaults) — spec 01 may reuse the title builder for notification titles.

**Consumes**

- Spec 04: `data.startTime` and the ISO-8601 date-time builder with the Bucharest offset (for `Event.startDate`). Until 04 lands, the renderer emits date-only `startDate`; the integration is a one-line call.
- Spec 06: the preview-image fallback chain for content items (`Event.image`, `og:image` on item pages).
- Spec 01: the final manifest/PWA head tags (untouched by this spec; the injection inserts before `</head>` and leaves them intact) and the denylist entries above.
- Existing domain docs: "what is an event / upcoming" (Expiration Behavior in `content-model.md`), unchanged.

## 8. Rollout

- **Flags:** none at runtime. Setting `PUBLIC_BASE_URL` is the only new deploy prerequisite (startup fails without it in production — announce before deploying).
- **Migration:** none for the core; `0014_site_address_fields.sql` only with task T8 (nullable columns, backward compatible, no data backfill).
- **Deploy order:** (1) T1 `public-url.ts` can merge alone (specs 02/06 depend on it); (2) T2 robots/noindex; (3) T3–T6 injection + SPA changes together (the SPA must tolerate both presence and absence of inline data, so the API and app can also ship separately); (4) T5 sitemap; (5) after deploy: Search Console verification, sitemap submission, GBP link (T9).
- **Rollback:** the renderer is isolated — removing the three route registrations (and restoring `index: true`) returns the server to the current behaviour; the SPA keeps working because it falls back to fetching. `robots.txt` and `sitemap.xml` routes can be removed independently. Nothing is cached by crawlers in a harmful way (`no-cache`, short sitemap TTL).
- **Verification after deploy:** `curl -A "Mozilla/5.0 (compatible; GPTBot/1.0)" https://{host}/` shows the snapshot; Rich Results Test on `/`, `/:siteSlug`, `/i/:itemId`; Search Console URL inspection → "Page is indexable".

## 9. Testing

### 9.1 Cypress (frontend, API stubbed — `cypress/e2e/*.cy.ts`)

Happy flows:

- `seo-head.cy.ts`: on `/` and `/centru` (fixture sites) `cy.title()` matches the shared title rule and `link[rel=canonical]` ends with the path; switching sites updates both. Update `home.cy.ts:32` (`cy.title().should('eq', 'Betel Info')`) to the new rule.
- `item-page.cy.ts`: `/i/:id` with a dated card fixture renders the item, a `<time datetime>` element, the site link and the "back to hub" link; unknown id shows the not-found state.
- `initial-data.cy.ts`: `cy.visit('/', { onBeforeLoad })` that injects `#betel-initial-data` into the document before the app boots → no `/api/content` request is made (`cy.intercept` with `times: 0` assertion) and the feed renders from the inline data; without the script the fetch happens (regression for the service-worker/offline path).
- `semantic-html.cy.ts`: exactly one `h1`; no heading level skipped inside the feed; every `img` has an `alt` attribute; feed images have `width`/`height` or an aspect box; `main`, `nav`, `header`, `footer` present.
- `tracking-bots.cy.ts`: with `navigator.webdriver = true` (Cypress default) `POST /api/events` is **not** called for `site_visit` — note that Cypress itself sets `webdriver`, so the existing `home.cy.ts` visits already exercise the skip; add an explicit assertion and a test that stubs `navigator.userAgent` to a non-bot string to confirm tracking still fires.

Regression: `expired-content.cy.ts` and `site-exclusive.cy.ts` extended with an `/i/:id` case (expired → not-found state).

### 9.2 Snapshot parity (new, runs in Cypress against fixtures)

`snapshot-parity.cy.ts` loads the fixture content through the API renderer exported as a pure function (`render-snapshot.ts` is dependency-free TypeScript; the test imports it via a small Node-side task in `cypress.config.ts`), mounts the resulting HTML, and asserts that the set of (title, date, link) tuples equals what the SPA renders for the same fixture. This is the guard against the two renderers drifting.

### 9.3 Manual checks (backend behaviour not covered by the suite)

Run against `pnpm dev:api` (`:3100`) or `docker compose up --build` (`:8080`) with the production build (`pnpm build && pnpm build:api`), since Vite dev does not inject:

1. `curl -s localhost:3100/ | head -60`: `<title>`, description, canonical, OG, one `application/ld+json` block, snapshot inside `#root`, `#betel-initial-data` present; `curl -s localhost:3100/{slug}` shows the site title and only that site's items; `curl -si localhost:3100/does-not-exist` → 404 + `noindex`.
2. `curl -si localhost:3100/admin/content` → `X-Robots-Tag: noindex, nofollow`; `/robots.txt` → `text/plain` with the rules; `/sitemap.xml` → valid XML (`xmllint --noout`), item URLs resolve with 200.
3. Paste `/`, `/{slug}`, `/i/{id}` HTML into the Rich Results Test: `Event` valid (no "missing field location"), `Organization`/`WebSite` detected, no errors. Validate JSON-LD with the Schema Markup Validator.
4. Escaping: create a draft card titled `</script><img src=x onerror=alert(1)>`, publish, load `/`: title appears as text, no script executes, JSON-LD still parses.
5. Cache: two requests within the TTL make one DB query (enable Fastify/postgres logging); `If-None-Match` returns 304; after the TTL (or an admin write with `seoCache.clear()`) a new item appears.
6. Lighthouse mobile on `/` and `/{slug}`: LCP/CLS/INP within FR-073, HTML size within budget.
7. Startup: unset `PUBLIC_BASE_URL` with `NODE_ENV=production` → process exits with a clear message; `PUBLIC_BASE_URL=https://x/` is normalised to `https://x`.
8. Offline/installed PWA: install the app, go offline, open it → the precached shell renders from the API cache (no inline data path), no errors in the console.

## 10. Work breakdown

One developer per task. "Touches" lists files created (new) or edited.

| # | Task | Touches | Depends on |
|---|---|---|---|
| T1 | **Public URL service.** `PUBLIC_BASE_URL` parsing/validation, `absoluteUrl()`, startup check, `configuration.md`/`example.env` entries, `docker-compose.yml` pass-through (`PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:-http://localhost:8080}`). | new `packages/api/src/services/public-url.ts`; `packages/api/src/index.ts`; `example.env`; `docker-compose.yml`; `docs/architecture/configuration.md` | — (merge first; unblocks specs 02/06) |
| T2 | **Robots and noindex.** `GET /robots.txt` route; `X-Robots-Tag` on the `/admin` fallback branch; 404-shell with `noindex` for unknown slugs (shell rendering stub until T4). | new `packages/api/src/routes/robots.ts`; `packages/api/src/index.ts` | T1 |
| T3 | **Page model and structured data.** Extract the public content query into `services/public-content.ts` (owned by spec 02; whichever of 02 / 03 lands first does the extraction, the other consumes it); `services/seo/page-data.ts` (sites, languages, content → `PageModel` incl. grouping and past-filter); `services/seo/organization.ts` (env config); `services/seo/structured-data.ts` (`WebSite`, `Organization`, `Church`, `Event`, `ItemList`, `WebPage`; event-location rule §6.2.3; JSON-LD escaping); unit-style checks via a `tsx` script. Hook for spec 04's date-time builder. | new files under `packages/api/src/services/seo/` and `services/public-content.ts` (if 02 has not extracted it yet); `packages/api/src/routes/content.ts`; `packages/shared/src/index.ts` (`Site.address` and optional address fields) | T1 |
| T4 | **HTML injection and routes.** Template loader with anchor assertions; `render-head.ts` (title/description/canonical/OG/Twitter/verification meta/`headExtras` hook); `render-snapshot.ts` (semantic feed HTML, escaped); inline data script; `cache.ts` (TTL + ETag); explicit `GET /`, `/:siteSlug`, `/i/:itemId` routes; `index: false` on the SPA static plugin; 404/410 shells. | new `packages/api/src/services/seo/{template,render-head,render-snapshot,cache}.ts`, `packages/api/src/routes/pages.ts`; `packages/api/src/index.ts`; `packages/shared/src/seo.ts` (title/description builders); `packages/shared/src/i18n-defaults.ts` | T1, T3 |
| T5 | **Sitemap.** `GET /sitemap.xml` from the content query; cache; `xmllint` check documented. | new `packages/api/src/routes/sitemap.ts`; `packages/api/src/index.ts` | T1, T3 |
| T6 | **SPA: item page, initial data, title sync, bot-safe tracking.** `/i/:itemId` route and `ItemPage` (use the `frontend-design` skill; renders one item via `ContentRenderer` with site context, address line, back link, not-found state); `main.tsx` seeds React Query from `#betel-initial-data`; `HomePage` sets `document.title` + canonical via `packages/shared/src/seo.ts`; `track()` skips bots (`navigator.webdriver`, UA regex `bot|crawl|spider|slurp|googlebot|bingbot|gptbot|claudebot|perplexitybot`); components import Romanian defaults from `i18n-defaults.ts`. | `packages/app/src/App.tsx`, `main.tsx`, new `public/pages/ItemPage.tsx`, `public/pages/HomePage.tsx`, `public/api/track.ts`, `public/api/client.ts` (item fetch: `GET /api/content/:id` **new public endpoint** returning one visible item, added to `routes/content.ts` by this task), `public/i18n/keys.ts` (new keys: `item.backToHub`, `item.notFound`, `nav.sites`, `seo.feedLabel`) | T4 for the data contract (can start in parallel against the agreed JSON shape) |
| T7 | **Semantic HTML and Core Web Vitals pass.** Heading levels (`h2` groups / `h3` items inside groups), `alt`/`aria-hidden` fix on the hero logo, `<nav>` around the site switcher, translated `aria-label`s, `<time datetime>`, image dimensions / `fetchpriority` / `decoding`, Franie fonts converted to `woff2` + preload of the heading font, Lighthouse report attached to the PR. Mirror the same semantics in `render-snapshot.ts` (coordinate with T4). | `packages/app/src/public/pages/HomePage.tsx`, `public/components/content/*.tsx`, `public/components/SiteSwitcher.tsx`, `packages/app/index.html` (font preload only — PWA tags untouched), `packages/app/src/index.css`, `packages/app/public/fonts/` | T4 (snapshot parity) |
| T8 | **Optional: structured site address.** Migration `0014_site_address_fields.sql`, `schema.ts`, `PATCH /api/admin/sites/:slug` body validation, Locations page fields (Romanian labels), `Site` type, `Church` markup consumes the new columns. | `packages/api/src/db/migrations/0014_site_address_fields.sql`, `packages/api/src/db/schema.ts`, `packages/api/src/routes/admin/sites.ts`, `packages/app/src/admin/pages/LocationsPage.tsx`, `packages/app/src/admin/api/client.ts`, `packages/shared/src/index.ts`, `docs/domain/entities.md` (via Doc integration) | T3 (reads the fields); needs Q3 = yes |
| T9 | **Ops and docs.** `GOOGLE_SITE_VERIFICATION` meta (code lives in T4; this task sets the value), Search Console property + sitemap submission, GBP website link, link from the main site, `deployment.md` checklist, `security.md` public-endpoint list, `overview.md` topology. | `docs/architecture/deployment.md`, `security.md`, `overview.md`, CapRover env | after deploy of T1–T5 |
| T10 | **Tests.** Cypress specs from §9.1–9.2, `home.cy.ts` title update, Node task in `cypress.config.ts` for the snapshot parity test, manual-check runbook in the PR description. | `cypress/e2e/seo-head.cy.ts`, `item-page.cy.ts`, `initial-data.cy.ts`, `semantic-html.cy.ts`, `tracking-bots.cy.ts`, `snapshot-parity.cy.ts`, `cypress/e2e/home.cy.ts`, `cypress.config.ts` | T4, T6, T7 |

Critical path: T1 → T3 → T4 → (T6 ‖ T7) → T10. T2 and T5 are parallel side tasks.

## 11. Open questions

| # | Question | Recommended default |
|---|---|---|
| Q1 | **Production domain.** The live hub answers on `https://info.bisericabetel.com` (the `.ro` variant does not resolve); the README example says `info.bisericabetel.ro`. Which is canonical, and should the other redirect 301? | `PUBLIC_BASE_URL=https://info.bisericabetel.com`; if a `.ro` is ever added, 301 it to `.com` at CapRover level. Fix the README example. |
| Q2 | **Is there a block outside the repo?** The code has none. Is there a CapRover/nginx rule, a Search Console removal request or a DNS-level block the owner remembers? | Assume none; verify with "URL inspection" in Search Console after verification (T9). |
| Q3 | **Structured site addresses (T8, migration 0014)?** Without it, `Church.address` is a single free-text street line plus a default country; with it, events get a complete `PostalAddress` and `geo`, which Google explicitly prefers. | Yes — build T8; it is small and the only way to give events a proper venue. Coordinator to confirm the migration number. |
| Q4 | **Index English (or other) language versions?** Requires `?lang=` URLs and an ADR-014 amendment. | Not now. Index Romanian only; revisit when a second language is complete enough to be worth indexing. |
| Q5 | **Per-item pages `/i/:itemId` (FR-069)?** They are new public URLs (shareable, appear in search). Without them there can be no Event rich results and no carousel, by Google's rules. | Yes. Keep them minimal (one item + back link); do not add them to the in-app navigation. Consider `/:siteSlug/i/:itemId` later only if per-site link overrides need distinct URLs. |
| Q6 | **Organisation identity in env vars (`SEO_ORG_*`) vs a settings table?** | Env vars for v1 (no migration, values rarely change); migrate to a settings table when a second config-like feature needs one. |
| Q7 | **Search Console ownership.** Which Google account owns the property, and is verification by DNS (preferred, covers all subdomains/protocols) or by meta tag? | DNS TXT on `bisericabetel.com` as a Domain property owned by the church's Google account used for GBP; add the developer as a delegated owner. `GOOGLE_SITE_VERIFICATION` stays as a fallback. |
| Q8 | **Block AI crawlers?** The owner wants content easily extracted; `robots.txt` allows all. | Allow all. Document that `GPTBot`, `ClaudeBot`, `PerplexityBot`, `CCBot` can be disallowed with one line each if policy changes. |
| Q9 | **Event description source for Cards with per-site links.** The item page shows `data.link` resolved for the item's site (§6.2.3); should the Event `url` be the item page or the external link? | The item page (same domain, required by the carousel rules); the external link is rendered as the visible CTA and, if it is a registration link, as `offers.url` — deferred until a Card field distinguishes "registration" from "more info". |

## 12. Doc integration

Ready-to-paste snippets; applied by the coordinator, not by this spec.

### `docs/product/requirements.md` — new section after "MCP Content Creation"

```markdown
### SEO & Crawlability
See `docs/product/specs/03-seo.md` and ADR-022.
- FR-065: The API serves `GET /robots.txt` (allow all; disallow `/admin`, `/api/`, `/s/`, `/mcp`; `Sitemap:` line) and no public page carries `noindex`; `/admin/*` and `/s/:code` responses carry `X-Robots-Tag: noindex`. **[Proposed]**
- FR-066: `PUBLIC_BASE_URL` (origin, no trailing slash) is the single source of absolute URLs through `absoluteUrl(path)` (`packages/api/src/services/public-url.ts`); required in production. **[Proposed]**
- FR-067: `GET /`, `GET /:siteSlug` and `GET /i/:itemId` return server-rendered `<title>`, description, canonical, Open Graph/Twitter metadata and `<html lang>` built from live data; unknown slugs/items return 404 with `noindex`. **[Proposed]**
- FR-068: The home page embeds `WebSite`, `Organization` and one `Church` per site (JSON-LD) from the `sites` table and the `SEO_*` configuration; site pages embed their `Church`. **[Proposed]**
- FR-069: Each content item has a public page `/i/:itemId`; dated Cards with a resolvable site are marked up as `Event` (`startDate` from `data.startDate` + `data.startTime`, `location` → the site's `Church`); hub pages embed an `ItemList` of upcoming events when at least three exist. **[Proposed]**
- FR-070: Public pages are indexable without JavaScript: the server response contains a semantic HTML snapshot of the feed (default locale) and inline initial data that the SPA uses instead of refetching. **[Proposed]**
- FR-071: `GET /sitemap.xml` lists `/`, every site page and every visible item page with `lastmod`. **[Proposed]**
- FR-072: Public pages keep a semantic-HTML baseline: one `h1`, no skipped heading levels, `alt` on every image, image dimensions, landmarks, translated `aria-label`s, `<time datetime>`. **[Proposed]** (refines NFR-007)
- FR-073: Mobile Core Web Vitals budget for `/` and `/:siteSlug`: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, initial HTML ≤ 60 KB gzipped. **[Proposed]** (refines NFR-006)
- FR-074: Search ownership: optional `GOOGLE_SITE_VERIFICATION` meta tag; Search Console verification, sitemap submission and Google Business Profile linking are part of the deployment checklist; crawler visits are excluded from `site_visit` analytics. **[Proposed]**
```

### `docs/architecture/configuration.md` — rows for the "API server" table

```markdown
| `PUBLIC_BASE_URL` | Yes in production | `http://localhost:3100` (development only, logs a warning) | `src/services/public-url.ts` | Public origin of the hub (`https://info.bisericabetel.com`), no path or trailing slash. Base for canonical URLs, Open Graph, JSON-LD, `sitemap.xml`, `robots.txt`, feed links and short-link previews. Startup fails in production when missing or malformed. |
| `SEO_ORG_NAME` | No | `Biserica Baptistă Betel` | `src/services/seo/organization.ts` | Organisation name used in titles, `og:site_name` and `Organization.name`. |
| `SEO_SITE_NAME` | No | `Betel Info` | `src/services/seo/organization.ts` | `WebSite.name` (Google site name). `SEO_SITE_ALTERNATE_NAMES` (comma-separated, default `Info Biserica Betel`) → `WebSite.alternateName`. |
| `SEO_ORG_WEBSITE` | No | `https://www.bisericabetel.com` | `src/services/seo/organization.ts` | `Organization.url`; also the hero link target. |
| `SEO_ORG_SAME_AS` | No | unset | `src/services/seo/organization.ts` | Comma-separated official profile URLs for `Organization.sameAs`. |
| `SEO_ORG_LOGO_PATH` | No | `/icons/icon-512.png` | `src/services/seo/organization.ts` | Crawlable PNG (≥112×112) for `Organization.logo` and the default `og:image`. |
| `SEO_DEFAULT_COUNTRY` | No | `RO` | `src/services/seo/structured-data.ts` | `addressCountry` fallback for sites without a country. |
| `GOOGLE_SITE_VERIFICATION` | No | unset | `src/services/seo/render-head.ts` | Renders `<meta name="google-site-verification">` on `/`. |
| `SEO_CACHE_TTL_SECONDS` | No | `60` | `src/services/seo/cache.ts` | TTL of the in-memory cache of rendered pages and the sitemap; `0` disables. |
```

Also add `PUBLIC_BASE_URL` to the `docker-compose.yml` variable list and to `example.env` under "Required".

### `docs/architecture/security.md`

- Authorization → Public (no auth): add `GET /robots.txt`, `GET /sitemap.xml`, `GET /i/:itemId`, `GET /api/content/:id` (visible items only).
- New paragraph under "Sensitive data handling": "Server-rendered pages (ADR-022) embed database text in HTML and JSON-LD. All text is HTML-escaped and JSON is serialised with `<`, `>`, `&`, U+2028/2029 escaped, so content can never break out of the `<script>` element. Markdown is rendered server-side as plain text only. The page cache is keyed by path only and holds no visitor data."
- Known risks table: no new row; note that `/i/:itemId` must apply the same visibility rules as `GET /api/content`.

### `docs/architecture/overview.md` — Runtime Topology

Add under the container: `├─ /robots.txt, /sitemap.xml   crawler endpoints (ADR-022)` and change the last line to `└─ /, /:siteSlug, /i/:itemId → server-rendered head + content snapshot into the SPA shell; other paths → index.html fallback`. In "Frontend" add: "**SEO:** the API injects page metadata, JSON-LD and a static HTML snapshot of the feed into `index.html` for public pages; the SPA seeds its data from the inline JSON and replaces the snapshot on mount ([ADR-022](../decisions/ADR-022-server-side-head-injection-and-content-snapshot.md))."

### `docs/architecture/deployment.md` — First-time CapRover setup

Add step 7: "**Public URL and search:** set `PUBLIC_BASE_URL` to the HTTPS origin (startup fails without it). After the first deploy: verify the domain in Google Search Console (DNS TXT, or set `GOOGLE_SITE_VERIFICATION`), submit `{PUBLIC_BASE_URL}/sitemap.xml`, add the hub URL to the church's Google Business Profile(s) and link it from the main website. Check `curl -A GPTBot {PUBLIC_BASE_URL}/` returns the content snapshot."

### `docs/product/user-flows.md`

```markdown
### Flow 6 — Crawler or AI agent reads the hub
- Trigger: a search engine, link unfurler or AI crawler fetches a public URL
- Steps:
  - `GET /robots.txt` allows public paths and points to `/sitemap.xml`
  - `GET /sitemap.xml` lists the home page, every site page and every visible item page
  - `GET /`, `/:siteSlug`, `/i/:itemId` return HTML with title, description, canonical, Open Graph and JSON-LD (`WebSite`, `Organization`, `Church`, `Event`, `ItemList`) plus a readable HTML snapshot of the feed — no JavaScript needed
  - admin, API, short-link and MCP paths are excluded (`robots.txt`, `X-Robots-Tag`)
- Success state: the page is indexed with the correct title/description; dated events are eligible for event rich results
- Failure or edge states: unknown slug/item → 404 with `noindex`; expired item page → 404 with `noindex`; the snapshot and the SPA drift (guarded by the parity test)
```

### `docs/product/roadmap.md` — Phase 2

Add: "- **SEO and crawlability [planned — spec 03]:** server-rendered metadata and content snapshot, structured data (`Organization`/`Church`/`Event`), `robots.txt`, `sitemap.xml`, per-item pages, Core Web Vitals budget. See FR-065–FR-074, ADR-022."

### `docs/domain/entities.md` — Site (only with T8)

Append to "Key attributes": "structured address (`street_address`, `postal_code`, `address_locality`, `address_region`, `address_country`), `latitude`/`longitude`, `telephone`, `email` (migration `0014_site_address_fields.sql`) — used for the site's `Church` structured data; the free-text `address` remains the display label."

### `docs/domain/business-rules.md` — new rule (number assigned by the coordinator; next free after the other specs)

```markdown
- BR-030: A content item is exposed as a schema.org `Event` only when it is a Card, is currently visible on the public hub (published, not expired), has `data.startDate`, and resolves to exactly one site (its `exclusive_site`, the site page being rendered, or a single-entry `sites[]`). Items that cannot be tied to one physical site, and Richtext/Poster/Video items, are never marked up as events. The `Event.startDate` uses `data.startTime` when present (spec 04), otherwise the bare date.
```

### `docs/decisions/README.md` — index row

```markdown
| [ADR-022](ADR-022-server-side-head-injection-and-content-snapshot.md) | Server-side head injection and content snapshot for the public hub (no React SSR) | Proposed |
```

### `docs/architecture/constraints.md` — Implementation Guardrails

Add: "- **Indexability:** public pages must stay readable without JavaScript. Any change to the public feed's rendering must be mirrored in `packages/api/src/services/seo/render-snapshot.ts` (parity test `cypress/e2e/snapshot-parity.cy.ts`). Nothing may add `noindex` or robots rules to public paths without amending spec 03 / FR-065."
