# Deployment

## Production Model

Production runs as a **single Docker container** deployed to [CapRover](https://caprover.com). There is no separate nginx container and no systemd service management. The Fastify API process handles everything:

- Serves uploaded media files at `/uploads/` via `@fastify/static`
- Serves the frontend SPA from `dist/public/` via `@fastify/static`
- Registers all API routes under the `/api` prefix (e.g. `/api/sites`, `/api/auth/login`)
- Falls back to `index.html` for any unmatched non-`/api` route (SPA client-side routing support)

CapRover manages TLS termination and its own reverse proxy in front of the container. The container itself exposes port 3100.

See ADR-006 for the rationale behind collapsing nginx + api into a single container.

## Target Infrastructure

- **Platform:** CapRover (self-hosted PaaS on a VPS)
- **Container:** single CapRover app built from `./Dockerfile` (referenced in `captain-definition`)
- **Database:** PostgreSQL 16 — provisioned separately (e.g. via CapRover one-click marketplace)
- **TLS:** managed by CapRover's built-in Let's Encrypt integration
- **Media storage:** local volume on the container host; path controlled by `UPLOADS_DIR`

## Deployment Method

- `captain-definition` points to `./Dockerfile`
- The `Dockerfile` is a multi-stage build: builds the Vite frontend and the esbuild-bundled API, then copies both into a single production image
- Deployments are triggered manually — no automated CI/CD pipeline
- Migrations run automatically on API startup — no manual step needed

## Key Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Min 32 chars; signs JWT tokens |
| `UPLOADS_DIR` | Yes | Absolute path for uploaded media storage |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | No | Container HTTP port (default: 3100) |
| `HOST` | No | Bind address (default: `0.0.0.0`) |

## nginx/nginx.conf

The file `nginx/nginx.conf` remains in the repository but is **not used at runtime** — neither in production nor in the local `docker-compose.yml` (the nginx service was removed from compose). It is retained as a reference artifact only. Do not rely on it for production routing logic.

## HTTP Caching Strategy

The Fastify server applies differentiated `Cache-Control` headers when serving the frontend. The rules are implemented in the `setHeaders` callback of the `@fastify/static` plugin and in the `setNotFoundHandler` SPA fallback.

| Files | Cache-Control | Rationale |
|---|---|---|
| `assets/*` (Vite hash-busted JS/CSS) | `public, max-age=31536000, immutable` | Content hash guarantees uniqueness; safe to cache permanently |
| `index.html`, `sw.js`, `registerSW.js`, `workbox-*.js`, `.webmanifest` | `no-cache` | Must revalidate on every load; stale entry points cause users to run old app code |
| Everything else (fonts, icons, images) | `public, max-age=86400` | Stable assets; 1-day cache is a reasonable balance |
| SPA fallback (`setNotFoundHandler`) | `no-cache` (set explicitly on the reply) | Bypasses `@fastify/static` `setHeaders` callback; must be set manually |

The PWA service worker uses `registerType: 'autoUpdate'` (set in `vite.config.ts`). When a new version is deployed the service worker silently replaces itself on the user's next page load — no user interaction or hard-reload is required.

**Why this matters:** before this strategy was in place, browsers cached `index.html` and the service worker files without revalidation. Users — especially on mobile — continued running the previous version of the app after deploys, causing new features (e.g. shortlink redirects) to silently fail until a hard reload.

See ADR-013 for the full decision record including options considered and consequences.

## Local Development

In development, Vite's dev server proxies `/api` requests to `localhost:3100`. This works correctly because all API routes are registered under the `/api` prefix in the Fastify app.

```bash
# Start the Vite dev server (PWA + Admin at http://localhost:5173)
pnpm dev

# Start the API server (http://localhost:3100)
pnpm dev:api
```

## Environments

- **Local:** developer machine — Vite dev server + Fastify running natively
- **Staging:** not yet configured
- **Production:** CapRover single-app deployment as described above
