# Deployment

## Production Model

Production runs as a **single Docker container** deployed to [CapRover](https://caprover.com). There is no separate nginx container and no systemd service management. The Fastify API process handles everything:

- Serves uploaded media files at `/uploads/` via `@fastify/static`
- Serves the frontend SPA from `dist/public/` via `@fastify/static`
- Registers all API routes under the `/api` prefix (e.g. `/api/sites`, `/api/auth/login`)
- Serves the RSS event feeds at `/feed.xml` and `/:siteSlug/feed.xml` and the agent index `/llms.txt` (ADR-021)
- Handles short-link redirects at `/s/:code` and, when `MCP_SECRET` is set, the remote MCP endpoint at `/mcp`
- Falls back to `index.html` for any unmatched non-`/api` route (SPA client-side routing support)

CapRover manages TLS termination and its own reverse proxy in front of the container. The container listens on port 80 (`PORT=80` is set in the `Dockerfile`).

See [ADR-006](../decisions/ADR-006-single-container-deployment.md) for the rationale behind collapsing nginx + api into a single container.

## Target Infrastructure

- **Platform:** CapRover (self-hosted PaaS on a VPS)
- **Container:** single CapRover app built from `./Dockerfile` (referenced in `captain-definition`)
- **Database:** PostgreSQL 16 — provisioned separately (e.g. via CapRover one-click marketplace)
- **TLS:** managed by CapRover's built-in Let's Encrypt integration
- **Media storage:** local volume on the container host; path controlled by `UPLOADS_DIR`

## Deployment Method

- `captain-definition` points to `./Dockerfile`. CapRover builds the image itself from the uploaded source.
- The `Dockerfile` is a multi-stage build. It builds the Vite frontend and the esbuild-bundled API, copies both into one `node:24-slim` image, and installs the native `sharp` dependency for Linux with `npm install --omit=dev` inside `dist/`.
- Deployments are triggered manually. There is no CI/CD pipeline. Push the source with the CapRover CLI (`caprover deploy`) from a clean checkout of `main`, or use the CapRover dashboard (tarball upload or a configured Git webhook).
- Migrations run automatically on API startup. There is no manual step.
- There are no `pnpm deploy*` scripts. `pnpm deploy` is a pnpm built-in command and is unrelated to this project's deployment.

### First-time CapRover setup

1. **Database:** provision PostgreSQL 16 (CapRover one-click app or an external instance) and set `DATABASE_URL`.
2. **Environment variables:** set `DATABASE_URL`, `JWT_SECRET` and `UPLOADS_DIR`, plus any optional ones. See [configuration.md](configuration.md) for the full list.
3. **Container HTTP Port:** set it to `80` in the CapRover app settings. This is CapRover's default.
4. **Persistent volume:** mount a persistent directory at the path used for `UPLOADS_DIR` (the image default is `/app/uploads`), so uploaded media survives redeploys.
5. **HTTPS:** enable HTTPS and force-redirect in CapRover.
6. **Public URL and search:** set `PUBLIC_BASE_URL` to the HTTPS origin, e.g. `https://info.bisericabetel.com` (startup fails without it). After the first deploy: verify the domain in Google Search Console (DNS TXT on `bisericabetel.com` as a Domain property — preferred — or set `GOOGLE_SITE_VERIFICATION`), submit `{PUBLIC_BASE_URL}/sitemap.xml`, add the hub URL to the church's Google Business Profile(s) and link it from the main website and social profiles. Check that `curl -A GPTBot {PUBLIC_BASE_URL}/` returns the content snapshot and paste `/`, `/{slug}` and `/i/{id}` into the Rich Results Test. Paste `{PUBLIC_BASE_URL}/feed.xml` into the W3C Feed Validator (`https://validator.w3.org/feed/`; recommendations about the `ev`/`betel` namespaces are acceptable) and check `curl -sI {PUBLIC_BASE_URL}/feed.xml` (200, `application/rss+xml`, `ETag`, `Cache-Control: public, max-age=300`).
7. **First admin:** open `/admin/setup` once, or `POST /api/setup` with `{ "email", "password" }`. The endpoint creates the first super-admin only while the `users` table is empty, and returns 409 afterwards.

### Health check

`GET /health` returns `{ status, version, timestamp }`. `version` is the root `package.json` version, inlined at build time.

### SQL console database role

Migration `0012_sql_console_role.sql` creates the `NOLOGIN` role `betel_sql_console` and grants it to the app's DB user, which requires `SUPERUSER` or `CREATEROLE`. Without that privilege the migration only logs a WARNING and the SQL console (FR-049) answers 503 `kind: 'unavailable'` until a superuser runs the file against the database. Details: [security.md](security.md) → "SQL console".

## Configuration

All environment variables, their defaults and where they are read are documented in [configuration.md](configuration.md).

## nginx

There is no nginx layer in the project. The unused `nginx/nginx.conf` reference file was removed. CapRover's own nginx sits in front of the container and is managed by CapRover. The API limits media uploads to 5 MB, so CapRover's proxy body-size limit must be at least that.

## HTTP Caching Strategy

Fastify sets differentiated `Cache-Control` headers. Hashed `assets/*` are cached as immutable. `index.html`, the service worker files and the web manifest use `no-cache`; so do the server-rendered pages `/`, `/:siteSlug` and `/i/:itemId`, which also carry a strong `ETag` (304 on `If-None-Match`) and are cached in memory for `SEO_CACHE_TTL_SECONDS`. `robots.txt` is cached for an hour, `sitemap.xml` for ten minutes; the RSS feeds and `/llms.txt` use `public, max-age=300` with a strong `ETag` over a deterministic body (no in-memory cache). Other static files are cached for one day. The PWA service worker auto-updates. The rules, rationale and consequences are in [ADR-013](../decisions/ADR-013-http-cache-strategy.md). The implementation is in `packages/api/src/index.ts`.

### Server-rendered pages and Core Web Vitals

`/`, `/:siteSlug` and `/i/:itemId` are rendered by the API from the built `index.html` (ADR-022), so Vite dev (`pnpm dev`) shows the plain SPA. To inspect the real output, build both packages and run the API: `pnpm build && pnpm build:api`, copy `packages/app/dist` to `packages/api/dist/public`, then start `node packages/api/dist/index.js` with the root `.env` (or use `docker compose up --build`). Useful checks: `curl -s localhost:3100/ | head -60` (title, description, canonical, Open Graph, one `application/ld+json`, snapshot inside `#root`, `#betel-initial-data`); `curl -si localhost:3100/does-not-exist` (404 + `noindex`); `curl -si localhost:3100/admin/content` (`X-Robots-Tag`); `curl -s localhost:3100/sitemap.xml | xmllint --noout -`; `curl -s localhost:3100/feed.xml | xmllint --noout -` and `curl -s localhost:3100/llms.txt`.

Core Web Vitals budget (FR-073: LCP ≤ 2.5 s, TBT ≤ 200 ms, CLS ≤ 0.1, HTML ≤ 60 KB gzipped) against that production build, five runs per URL, median per metric:

```bash
npx lighthouse@12 http://localhost:3100/ --preset=mobile --only-categories=performance \
  --output=json --output-path=lighthouse/home-1.json        # repeat 1..5, and for /{slug}
curl -s localhost:3100/ | gzip -c | wc -c                 # ≤ 61440 bytes
```

Attach the JSON reports (not committed) and the median table, with the `lighthouseVersion` from the report, to the PR.

## Local Development

Dev runs the API and Vite natively with live reload; only PostgreSQL runs in Docker. Vite's dev server proxies `/api`, `/uploads` and `/s/` to the API on `localhost:3100`, so images and short links work on `:5173`.

```bash
pnpm dev:db       # dev PostgreSQL (docker-compose.yml, project betel-dev)
pnpm seed:dev     # optional: replace the dev DB + uploads with a copy of live
pnpm dev:api      # API on http://localhost:3100
pnpm dev          # PWA + Admin on http://localhost:5173
```

See the README Quick start for the full setup. Variables: [configuration.md](configuration.md).

## Environments

- **Local dev:** native API + Vite with live reload against the dev database (`docker-compose.yml`).
- **Local staging:** `docker-compose.staging.yml` (project `betel-staging`) runs the production `Dockerfile` image with its own PostgreSQL and uploads volume on `http://localhost:${STAGING_APP_PORT:-8080}`. `pnpm staging:up` always rebuilds. AI translation and `/mcp` are off unless the `STAGING_*` keys are set.
- **Seeding:** `scripts/seed-from-live.sh <dev|staging>` copies live data into either local environment (live is read-only). See [configuration.md](configuration.md#seeding-from-live-scriptsseed-from-livesh). Without database access, `scripts/seed-from-public.mjs <dev|staging>` (`pnpm seed:public:dev` / `seed:public:staging`) rebuilds the published, currently visible content and its images from the public API.
- **Remote staging:** not yet configured.
- **Production:** CapRover single-app deployment as described above.
