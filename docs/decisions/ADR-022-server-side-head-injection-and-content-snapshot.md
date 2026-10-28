# ADR-022: Server-side head injection and content snapshot for the public hub (no React SSR)

- **Status:** Proposed
- **Date:** 2026-10-28
- **Related:** ADR-005 (single app package), ADR-006 (single container), ADR-013 (HTTP cache strategy), ADR-014 (i18n strategy)
- **Implements:** FR-067, FR-068, FR-069, FR-070 (spec `docs/product/specs/03-seo.md`)

## Context

The public hub is a client-rendered React SPA. `packages/api/src/index.ts` serves `packages/app/dist/index.html` unchanged for `/` (through `@fastify/static`) and for `/:siteSlug` (through `setNotFoundHandler`). The response has a fixed `<title>Betel Info</title>`, no description, canonical, Open Graph or structured data, and an empty `<div id="root">`. Google renders JavaScript (in a delayed render phase) and would eventually index the page, but with weak signals; crawlers that do not execute JavaScript — link unfurlers, most AI agents (GPTBot, ClaudeBot, PerplexityBot and others read raw HTML only) and lighter search engines — see nothing.

The product owner wants the hub fully indexable, rich-result eligible (events, organisation, site name) and "easily extracted from the live page". Google's own guidance is that server-side or pre-rendering "is still a great idea" because not all bots run JavaScript, and that dynamic rendering (serving a headless-browser snapshot to bots) is a workaround, not a long-term solution.

Forces:

- Content changes several times a week without deploys; anything static at build time is stale.
- One container, one Node process, no vendor-specific services (ADR-006, constraints).
- Sunday-morning traffic spikes: the server must not do expensive per-request work.
- The hub is a single feed page per site, with four content types and ~1 000 lines of public React. Locale, theme and remembered site live in `localStorage` (ADR-014, FR-005), which a server cannot know.
- The PWA precaches `index.html` and serves it for navigations when installed/offline; whatever the server adds must be optional for the client.
- Structured data must describe content visible on the page (Google policy), so metadata alone is not enough for `Event` descriptions and locations.

## Options Considered

### A. Head injection only
The API replaces `<title>` and inserts metadata + JSON-LD before `</head>`.
- Pros: trivial; no body rendering; zero risk to the SPA.
- Cons: body still empty for non-JS fetchers; JSON-LD describes content those fetchers cannot see; AI extraction impossible; first paint still waits for two API calls.

### B. Head injection + server-rendered HTML snapshot + inline initial data (chosen)
The API renders a dependency-free HTML template of the feed (hero, site links, groups, items) into `#root`, inlines the JSON payloads the SPA needs, and injects head metadata. On mount React calls `createRoot(container).render()`, which discards the snapshot and renders from the inline data (no hydration, no mismatch rules).
- Pros: every crawler reads real content; Google gets metadata and content in the initial HTML; first paint no longer waits for `/api/sites` + `/api/content`; no second rendering stack in the build; the renderer is a few pure functions that can be tested in isolation; the SPA works identically when the snapshot is absent (precached shell, Vite dev).
- Cons: two renderers for the feed (React components and the HTML template) that must stay in sync — mitigated by a Cypress parity test and a shared field list; a brief visual swap on mount if the visitor's stored locale/site differs from the server's default; ~10–30 KB more HTML.

### C. Full React server-side rendering with hydration
Vite SSR build of `packages/app`, `renderToString` in the API, `hydrateRoot` in the browser, React Query dehydrate/hydrate.
- Pros: one renderer, exact fidelity, standard pattern.
- Cons: the esbuild-bundled API must consume a Vite SSR bundle of the app (two build pipelines coupled, CSS/asset handling, `window`/`localStorage` guards across `useSite`, `LanguageContext`, `useTheme`, the theme bootstrap script); hydration mismatches whenever the server guess (default site/locale/theme) differs from `localStorage`, which is the common case for returning visitors (FR-005 remembers the site); larger API bundle and memory; disproportionate for one feed page. Worth revisiting if the hub gains real routed pages.

### D. Build-time prerendering
Static HTML generated during `vite build`.
- Rejected: content is dynamic and admin-driven; a build snapshot is stale immediately and would show expired events.

### E. Dynamic rendering / prerender service for bots
Detect bot user agents and serve a headless-Chrome rendering (self-hosted Chrome in the container or a third-party service).
- Rejected: Google states it is a workaround, not a long-term solution; adds heavy infrastructure or a vendor dependency against the no-lock-in constraint; cloaking-adjacent; does nothing for human first paint.

## Decision

Adopt **option B**:

1. The API registers explicit `GET /`, `GET /:siteSlug` and `GET /i/:itemId` routes (before the SPA static plugin, which is configured with `index: false`). Each loads a `PageModel` from the database (sites, enabled languages, the public content list for the scope in the default locale, using the same query as `GET /api/content`), and renders `index.html` with:
   - `<title>`, description, canonical, Open Graph/Twitter, optional verification meta, and a JSON-LD `@graph` (`WebSite`, `Organization`, `Church` per site, `ItemList`, `Event`/`WebPage` on item pages) inserted before `</head>`;
   - a semantic HTML snapshot of the feed inside `<div id="root">`, HTML-escaped, default locale only, no Markdown rendering (plain text);
   - `<script id="betel-initial-data" type="application/json">` with the same payloads, serialised with `<`, `>`, `&`, U+2028/2029 escaped.
2. The template is read once at startup and split at `<title>…</title>`, `</head>` and `<div id="root"></div>`; a missing anchor fails startup.
3. Rendered pages are cached in memory per path for `SEO_CACHE_TTL_SECONDS` (default 60 s) with a strong `ETag`; responses keep `Cache-Control: no-cache` (ADR-013). The cache key never includes visitor data.
4. The SPA seeds React Query from the inline data when present and otherwise fetches as today. It replaces the snapshot with `createRoot().render()`; **hydration is not used**, so markup differences are not errors.
5. Other locales, the visitor's remembered site and the theme are client concerns and are not rendered server-side (ADR-014 unchanged).
6. `setNotFoundHandler` keeps serving the plain template for every other non-`/api` path (`/admin/*` with `X-Robots-Tag: noindex, nofollow`), so admin routes and deep links are unaffected.

Rules that follow:

- Any change to what the public feed renders (new content type, new field shown) must be mirrored in `packages/api/src/services/seo/render-snapshot.ts`; the parity test fails otherwise.
- All structured data must correspond to visible snapshot content.
- `PUBLIC_BASE_URL` is mandatory in production; every absolute URL goes through `absoluteUrl()`.

## Implementation

- `packages/api/src/services/public-url.ts` — `PUBLIC_BASE_URL`, `absoluteUrl()`.
- `packages/api/src/services/public-content.ts` — public content query (owned by spec 02, RSS) shared by `routes/content.ts`, the feed and the renderer.
- `packages/api/src/services/seo/{page-data,organization,structured-data,render-head,render-snapshot,template,cache}.ts`.
- `packages/api/src/routes/pages.ts` (`/`, `/:siteSlug`, `/i/:itemId`), `routes/robots.ts`, `routes/sitemap.ts`; registration order in `packages/api/src/index.ts`.
- `packages/shared/src/seo.ts` (title/description builders used by both sides), `packages/shared/src/i18n-defaults.ts` (Romanian UI defaults).
- `packages/app/src/main.tsx` (inline-data seeding), `public/pages/ItemPage.tsx`, `HomePage.tsx` (`document.title`/canonical sync).
- No database migration (an optional `0014_site_address_fields.sql` belongs to spec 03 task T8, not to this decision).

## Consequences

- Public pages become indexable and extractable by every crawler; Google receives metadata, structured data and content in the initial response rather than after rendering.
- First paint and LCP improve for humans (no API round-trip before content), at the cost of a larger HTML document (budget: ≤60 KB gzipped, FR-073).
- The feed has two renderers. The parity test and the shared field list keep them aligned; developers adding a public content type now touch the API snapshot as well (added to `constraints.md` guardrails).
- Per-request DB work is bounded by the cache TTL; a 60 s staleness window for crawlers and first paints is accepted (React Query's own `staleTime` is already 60 s).
- Returning visitors whose remembered site or locale differs from the URL default see the server snapshot for a few hundred milliseconds before the SPA renders their preference. If this proves distracting, the snapshot can be hidden for JS-capable browsers via a `<noscript>`-inverse class toggled in the theme bootstrap script without changing the design.
- The installed PWA keeps working offline with the precached shell (no inline data path), so the client must never assume the inline script exists.
- Full React SSR (option C) remains the escape hatch if the public hub grows beyond a feed page; this decision does not preclude it, and the `PageModel` + JSON-LD builders would be reused as-is.
