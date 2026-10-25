# Configuration Reference

This is the single reference for every environment variable the project reads. Other documents (README, `deployment.md`, `example.env`, the compose files) link here instead of repeating it.

## Where variables come from

| Context | Source |
|---|---|
| Local API (`pnpm dev:api`) | Root `.env`, loaded by `dotenv-cli` (`dotenv -e ../../.env`). Copy it from `example.env`. |
| `pnpm --filter @betel/api seed-admin` | Root `.env` (same mechanism). Variables already exported in the shell take precedence. |
| Vite dev server (`pnpm dev`) | Shell environment only. Vite does **not** load the root `.env` into `process.env` for `vite.config.ts`. |
| `docker compose` (`pnpm dev:db`, `pnpm staging:up`) | Root `.env`, used for `${...}` substitution in `docker-compose.yml` and `docker-compose.staging.yml`. Only the variables listed in the compose file reach a container. |
| `scripts/seed-from-live.sh` | Root `.env`, sourced by the script (`pnpm seed:dev`, `pnpm seed:staging`). |
| Production (CapRover) | App-level environment variables in the CapRover dashboard. Defaults baked into the `Dockerfile` apply otherwise. |
| Stdio MCP server (`packages/mcp`) | The `env` block of the MCP client config (e.g. `claude_desktop_config.json`). |

An empty value (`KEY=`) counts as "set" for most code. `example.env` therefore keeps optional keys commented out. The API treats an empty `PORT`, `HOST` or `UPLOADS_DIR` as unset in `packages/api/src/index.ts`.

## API server (`packages/api`)

| Variable | Required | Default | Read in | Purpose |
|---|---|---|---|---|
| `DATABASE_URL` | Yes | none (startup fails) | `src/db/client.ts`, `src/scripts/seed-admin.ts` | PostgreSQL connection string. PostgreSQL is the only supported database ([ADR-016](../decisions/ADR-016-postgresql-only.md)). |
| `JWT_SECRET` | Yes | none (startup fails) | `src/index.ts` | Signs admin JWTs. Use at least 32 random characters. |
| `PORT` | No | `3100` in code; `80` in the Docker image | `src/index.ts` | HTTP listen port. Local dev uses 3100 (the Vite proxy target). The container always listens on 80. |
| `HOST` | No | `0.0.0.0` | `src/index.ts` | Bind address. |
| `UPLOADS_DIR` | No (Yes in production) | `<cwd>/../uploads` in code; `/app/uploads` in the Docker image (`docker-compose.staging.yml` sets the same, backed by its `uploads` volume) | `src/index.ts`, `src/routes/admin/media.ts`, `src/routes/mcp.ts` | Directory for uploaded media, served at `/uploads/`. In production it must be a persistent volume. With `pnpm dev:api` the default resolves to `packages/uploads/`. |
| `OPEN_ROUTER_API_KEY` | No | unset (feature off) | `src/services/ai-translation.ts` | Enables AI auto-translation of content items and groups via OpenRouter ([ADR-010](../decisions/ADR-010-ai-auto-translation-fire-and-forget.md)). |
| `MCP_SECRET` | No | unset (endpoint off) | `src/routes/mcp.ts` | Enables the remote MCP endpoint at `/mcp`. Clients authenticate with `Authorization: Bearer <MCP_SECRET>` ([ADR-015](../decisions/ADR-015-remote-mcp-endpoint.md)). |
| `PUBLIC_BASE_URL` | Yes in production | `http://localhost:3100` (development only, logs a warning) | `src/services/public-url.ts` | Public origin of the hub (`https://info.bisericabetel.com`), no path or trailing slash (trailing slashes are stripped). Base for canonical URLs, Open Graph, JSON-LD, `sitemap.xml`, `robots.txt`, short-link previews, and every absolute URL in the RSS feeds and `/llms.txt` (spec 02). Also used for the `url` field of short links returned by the admin API and the MCP `create_short_link` / `list_short_links` tools (spec 05). Startup fails in production when missing or malformed. |
| `SEO_ORG_NAME` | No | `Biserica Baptistă Betel` | `src/services/seo/organization.ts` | Organisation name used in titles, `og:site_name` and `Organization.name`. |
| `SEO_SITE_NAME` | No | `Betel Info` | `src/services/seo/organization.ts` | `WebSite.name` (Google site name) and the hub title. `SEO_SITE_ALTERNATE_NAMES` (comma-separated, default `Info Biserica Betel`) → `WebSite.alternateName`. |
| `SEO_ORG_WEBSITE` | No | `https://www.bisericabetel.com` | `src/services/seo/organization.ts` | `Organization.url`, first `sameAs` entry, and the hero link of server-rendered pages. |
| `SEO_ORG_SAME_AS` | No | unset | `src/services/seo/organization.ts` | Comma-separated official profile URLs for `Organization.sameAs`. |
| `SEO_ORG_LOGO_PATH` | No | `/icons/icon-512.png` | `src/services/seo/organization.ts` | Crawlable PNG (≥112×112) for `Organization.logo` and the default `og:image`. |
| `SEO_DEFAULT_COUNTRY` | No | `RO` | `src/services/seo/organization.ts` | `addressCountry` fallback for sites without a country. |
| `GOOGLE_SITE_VERIFICATION` | No | unset | `src/services/seo/organization.ts` (rendered by `render-head.ts`) | Renders `<meta name="google-site-verification">` on `/`. |
| `SEO_CACHE_TTL_SECONDS` | No | `60` | `src/services/seo/cache.ts` | TTL of the in-memory cache of rendered pages and the sitemap; `0` disables. Admin and MCP writes clear it. |
| `NODE_ENV` | No | `production` in the Docker image | `src/services/public-url.ts` | `production` makes `PUBLIC_BASE_URL` mandatory. Set by the `Dockerfile` and `docker-compose.staging.yml`. |

## Frontend dev server (`packages/app`)

| Variable | Required | Default | Read in | Purpose |
|---|---|---|---|---|
| `API_TARGET` | No | `http://localhost:3100` | `vite.config.ts` | Target of the Vite dev proxy for `/api`, `/uploads`, `/s/`, `/robots.txt`, `/sitemap.xml`, the feeds and `/llms.txt`. Pass it in the shell, e.g. `API_TARGET=http://localhost:8080 pnpm dev`. |

The production frontend has no build-time variables. It calls the API on the same origin under `/api`.

## Stdio MCP server (`packages/mcp`)

| Variable | Required | Default | Read in | Purpose |
|---|---|---|---|---|
| `BETEL_EMAIL` | Yes | none (exits) | `src/index.ts` | Admin account email used to log in to the API. |
| `BETEL_PASSWORD` | Yes | none (exits) | `src/index.ts` | Password for that account. |
| `BETEL_API_URL` | No | `http://localhost:3100/api` | `src/index.ts` | Base URL of the API, including the `/api` prefix. |

The parity check (`pnpm --filter @betel/mcp parity [--calls]`, `src/parity-check.ts`, development only; ADR-024) spawns the built `dist/index.js` with the variables above and additionally reads `BETEL_MCP_URL` (the remote endpoint, e.g. `http://localhost:3100/mcp`) and `MCP_SECRET`; `PARITY_ITEM_ID` / `PARITY_CODE` optionally pin the item and short link used by `--calls` (discovered from the remote surface otherwise). These are not application settings and are not in `example.env`.

## Dev database (`docker-compose.yml`, project `betel-dev`)

PostgreSQL only. The API and Vite run natively (`pnpm dev:api`, `pnpm dev`).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DB_PASSWORD` | Yes | none | Password for the dev PostgreSQL 16 database (user `betel`, database `info_bisericabetel`). It is inserted unescaped into URLs (`DATABASE_URL`, and the staging app's connection string), so it must be URL-safe: characters such as `#`, `@`, `/`, `:`, `?` or `%` break startup. Generate it with e.g. `openssl rand -hex 24`. |
| `DB_HOST_PORT` | No | `5432` | Host port (bound to `127.0.0.1`) for the dev PostgreSQL. `DATABASE_URL` in `.env` must point at it. |

## Local staging (`docker-compose.staging.yml`, project `betel-staging`)

The production `Dockerfile` image with its own PostgreSQL and uploads volume, separate from dev. See [deployment.md](deployment.md#environments).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DB_PASSWORD` | Yes | none | Reused as the staging database password (same URL-safety rule as above). |
| `JWT_SECRET` | Yes | none | Reused to sign staging JWTs unless `STAGING_JWT_SECRET` is set. |
| `STAGING_JWT_SECRET` | No | `JWT_SECRET` | Overrides the staging JWT secret. |
| `STAGING_APP_PORT` | No | `8080` | Host port mapped to the app container's port 80. |
| `STAGING_DB_PORT` | No | `5433` | Host port (bound to `127.0.0.1`) for the staging PostgreSQL. |
| `STAGING_OPEN_ROUTER_API_KEY` | No | unset (feature off) | Opt-in `OPEN_ROUTER_API_KEY` for staging. The production key is **not** inherited, so editing staging content never triggers paid translation calls. |
| `STAGING_MCP_SECRET` | No | unset (endpoint off) | Opt-in `MCP_SECRET` for staging. The production secret is not inherited. |
| `STAGING_PUBLIC_BASE_URL` | No | `http://localhost:<STAGING_APP_PORT>` | Staging's `PUBLIC_BASE_URL`. Required because staging runs with `NODE_ENV=production`; `.env`'s `PUBLIC_BASE_URL` (the dev origin) is not inherited. `SEO_*`, `GOOGLE_SITE_VERIFICATION` and `SEO_CACHE_TTL_SECONDS` are passed through from `.env` unchanged. |

`DATABASE_URL` from `.env` is **not** passed to the staging app: it points at `localhost` for host development, while the container always uses its own `db` service.

## Seeding from live (`scripts/seed-from-live.sh`)

`pnpm seed:dev` / `pnpm seed:staging` replace the target database (and uploads) with a copy of live. Live is only read (`pg_dump`, `tar`). Set `LIVE_SSH` or `LIVE_DATABASE_URL`; the rest have defaults. Only Docker is needed locally. Options and behaviour: header of the script.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `LIVE_SSH` | One of `LIVE_SSH` / `LIVE_DATABASE_URL` | none | `user@host` of the CapRover server. `pg_dump` runs inside the live Postgres container (found by the `LIVE_DB_SERVICE` name prefix) and uploads are tarred from the app container (`LIVE_APP_SERVICE`, using its `UPLOADS_DIR`). The user needs Docker access. |
| `LIVE_DATABASE_URL` | One of the two | none | Direct connection to the live database (e.g. SSH tunnel). Database only, no uploads. `localhost` is rewritten to `host.docker.internal` because `pg_dump` runs in a container. |
| `LIVE_DB_SERVICE` | No | `srv-captain--info-bisericabetel-db` | Service name prefix of the live Postgres container. |
| `LIVE_APP_SERVICE` | No | `srv-captain--info-bisericabetel` | Service name prefix of the live app container. |
| `LIVE_DB_USER` | No | `postgres` | Live database user. |
| `LIVE_DB_NAME` | No | `postgres` | Live database name. |

Dumps are cached in the gitignored `.local/`. Live users, including their password hashes, are copied: log in locally with live credentials. Never commit `.local/`.

## Removed variables

The following appeared in earlier templates. No code reads them:

- `CORS_ORIGIN`: CORS is configured with `origin: true` in `src/index.ts`.
- `SEED_ALLOWED`
- `RESEND_API_KEY`, `EMAIL_FROM`: reserved for the planned email features (FR-030, FR-031). Re-add them when the integration ships.
