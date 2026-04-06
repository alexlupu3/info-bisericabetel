# ADR-006: Single-container deployment — Fastify serves frontend, media, and API

## Status
Accepted

## Date
2026-04-06

## Context

The project previously used a two-container Docker deployment model:

- `Dockerfile.frontend` — an nginx container that served the frontend SPA and reverse-proxied `/api/` requests to the API container.
- `Dockerfile.api` — a Fastify API container.
- `captain-definition` pointed to `Dockerfile.frontend`.
- CORS was cross-origin because the two services were separate.

This pattern created operational overhead: two CapRover apps to provision and monitor, a separate nginx config to maintain, cross-origin CORS to manage, and more moving parts to reason about during incident response.

## Options Considered

1. **Keep two containers (status quo)** — maintain separate nginx and API containers; configure CORS between them; keep two CapRover apps.
2. **Single container — nginx serves static files, proxies API** — reverse to the previous model: one container with nginx in front, API in the background. Requires a process manager (e.g. supervisord) inside the container to run both processes.
3. **Single container — Fastify serves everything** — API process serves both the frontend SPA (via `@fastify/static`) and all API routes (under `/api` prefix). No nginx at runtime. One container, one process, one CapRover app.

## Decision

Adopt option 3: a single container where the Fastify process handles all runtime responsibilities.

`packages/api/src/index.ts` was updated to:

- Serve uploaded media files at `/uploads/` via `@fastify/static` (pointing to `UPLOADS_DIR`)
- Serve the frontend SPA from `dist/public/` via `@fastify/static`
- Register all API routes under the `/api` prefix (e.g. `/api/sites`, `/api/auth/login`)
- Use a `setNotFoundHandler` SPA fallback: any request that does not match an API route and does not match a static file returns `dist/public/index.html`, supporting client-side routing in the SPA

The `Dockerfile` was updated to a multi-stage build that:

1. Builds the Vite frontend (`packages/app`) — output to `packages/app/dist/`
2. Builds the esbuild-bundled API (`packages/api`) — output to `packages/api/dist/`
3. Copies the API bundle into `dist/`
4. Copies the frontend build into `dist/public/`
5. Produces a single production image that runs `node dist/index.js`

`captain-definition` was updated to point to `./Dockerfile`. `Dockerfile.frontend` and `Dockerfile.api` were deleted.

## Consequences

- **One CapRover app** instead of two — simpler provisioning, monitoring, and rollback.
- **No nginx at runtime** — `nginx/nginx.conf` remains in the repository as a reference artifact but is not used in production. Routing logic formerly in nginx (SPA fallback, `/api` proxy) is now handled by Fastify directly.
- **CORS is same-origin in production** — frontend and API are served from the same origin. CORS remains enabled in the Fastify config for local development compatibility, but the restriction is relaxed to the app's own public URL.
- **Development workflow unchanged** — Vite dev server still proxies `/api` to `localhost:3100`. This works correctly because all API routes are registered under the `/api` prefix.
- **`UPLOADS_DIR` env var** — still required; controls where media files are stored on the container's filesystem. A persistent volume must be mounted at this path in CapRover to survive redeploys.
- **Native dependency note** — `sharp` (image processing) is declared as a production dependency in `dist/package.json` and installed inside the container at build time via `npm install --omit=dev`. No manual intervention needed.
- **Supersedes:** the two-container model described in the former `Dockerfile.frontend` / `Dockerfile.api` setup. See `docs/architecture/deployment.md` for current deployment details.
