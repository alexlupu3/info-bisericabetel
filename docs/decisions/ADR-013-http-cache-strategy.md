---
status: Accepted
date: 2026-05-16
---

# ADR-013: HTTP Caching Strategy for the SPA Frontend

## Status
Accepted

## Context

The application is served as a single-page application (SPA) from a Fastify server inside a Docker container. The server uses `@fastify/static` to serve the built frontend from `dist/public/` and falls back to `index.html` for all unmatched non-`/api` routes (client-side routing support).

After deploying a new version, users — particularly on mobile — were continuing to load the previous version of the app because:

1. Browsers were caching `index.html` aggressively or without revalidation, so users never fetched the new entry point that references the updated JS/CSS bundles.
2. The PWA service worker (`sw.js`, `registerSW.js`) was also cached, so the new service worker was not fetched and the update prompt was not shown.
3. The shortlink redirect feature (`/s/:code`) was introduced in this release and failed silently for users running a cached old app — links did not redirect as expected, and reloading was required.

Two configuration sites needed to change: the PWA `registerType` setting in `vite.config.ts`, and the `Cache-Control` headers emitted by the Fastify static file handler.

## Options Considered

### PWA update behavior

#### Option A: `registerType: 'prompt'` (previous)
The service worker waits for user confirmation before installing the new version. New app code is only activated after the user explicitly dismisses a prompt (or closes all tabs).

- Pros: no surprise reloads; user controls when the update applies.
- Cons: non-technical users ignore or dismiss prompts; the new version is not used until the next manual reload. Mobile users rarely close all tabs, so the old version can persist for days.

#### Option B: `registerType: 'autoUpdate'` (chosen)
The service worker silently replaces itself on the next page load after a new deploy. No user interaction is required.

- Pros: all users run the latest version within one page load cycle after a deploy; eliminates the silent-stale-app problem.
- Cons: in-progress user actions are not disrupted (the new SW activates on the *next* load, not the current one), so the practical risk of data loss is minimal.

### HTTP Cache-Control headers

The core constraint is that Vite hash-busts all JS and CSS bundles (e.g. `assets/index-Bc3kX9aP.js`) but does not hash the entry-point files (`index.html`, service worker files, and the web manifest). These entry-point files must never be stale in the browser cache.

Three categories of files were identified:

| Category | Files | Strategy |
|---|---|---|
| Hash-busted bundles | `assets/*` (JS, CSS) | `public, max-age=31536000, immutable` |
| Entry points & SW files | `index.html`, `sw.js`, `registerSW.js`, `workbox-*.js`, `.webmanifest` | `no-cache` |
| Static assets | All other files (fonts, icons, images) | `public, max-age=86400` |

`no-cache` is used (not `no-store`) for entry-point files so the browser still caches them locally but must revalidate with the server on every use. This keeps the round-trip fast (304 Not Modified if unchanged) while guaranteeing freshness.

A fourth case required special handling: the SPA fallback in `setNotFoundHandler`. This handler returns `index.html` for all unmatched routes to support client-side routing. Because this path bypasses the `@fastify/static` plugin (and therefore its `setHeaders` callback), the `Cache-Control: no-cache` header must be set explicitly on the reply inside the fallback handler.

## Decision

- **PWA update mode**: `registerType: 'autoUpdate'` in `vite.config.ts`.
- **Hash-busted assets** (`/assets/*`): `Cache-Control: public, max-age=31536000, immutable`.
- **Entry points and service worker files** (`index.html`, `sw.js`, `registerSW.js`, `workbox-*.js`, `.webmanifest`): `Cache-Control: no-cache`.
- **Other static files** (fonts, icons, etc.): `Cache-Control: public, max-age=86400`.
- **SPA fallback handler**: explicitly sets `Cache-Control: no-cache` on every response because the `@fastify/static` `setHeaders` callback does not run for this code path.

## Consequences

- **Users always run the latest version** within one page load after a deploy — no manual hard-reload required, no stale app on mobile.
- **Zero downtime for in-progress sessions**: the new service worker activates on the *next* page load, not the current one, so active user sessions are unaffected by a deploy.
- **Short-lived feature regressions after deploys are eliminated**: the shortlink redirect failure that motivated this change is no longer reproducible after the first page load following a deploy.
- **Vite bundle caching is maximally efficient**: `immutable` on hash-busted assets means browsers never re-request them until the hash changes (i.e. the file content changes). CDN or intermediate caches also honour this.
- **`setNotFoundHandler` must always set `no-cache` explicitly**: this is a subtle coupling point. If the SPA fallback handler is ever refactored, ensure the `Cache-Control: no-cache` header is preserved on the reply; otherwise `index.html` can be cached without revalidation by the SPA fallback path.
