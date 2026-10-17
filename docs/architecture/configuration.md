# Configuration Reference

This is the single reference for every environment variable the project reads. Other documents (README, `deployment.md`, `example.env`, `docker-compose.yml`) link here instead of repeating it.

## Where variables come from

| Context | Source |
|---|---|
| Local API (`pnpm dev:api`) | Root `.env`, loaded by `dotenv-cli` (`dotenv -e ../../.env`). Copy it from `example.env`. |
| `pnpm --filter @betel/api seed-admin` | Root `.env` (same mechanism). Variables already exported in the shell take precedence. |
| Vite dev server (`pnpm dev`) | Shell environment only. Vite does **not** load the root `.env` into `process.env` for `vite.config.ts`. |
| `docker compose` | Root `.env`, used for `${...}` substitution in `docker-compose.yml`. Only the variables listed in the compose file reach the container. |
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
| `UPLOADS_DIR` | No (Yes in production) | `<cwd>/../uploads` in code; `/app/uploads` in the Docker image (`docker-compose.yml` sets `/uploads`, backed by the `uploads` volume) | `src/index.ts`, `src/routes/admin/media.ts`, `src/routes/mcp.ts` | Directory for uploaded media, served at `/uploads/`. In production it must be a persistent volume. With `pnpm dev:api` the default resolves to `packages/uploads/`. |
| `OPEN_ROUTER_API_KEY` | No | unset (feature off) | `src/services/ai-translation.ts` | Enables AI auto-translation of content items and groups via OpenRouter ([ADR-010](../decisions/ADR-010-ai-auto-translation-fire-and-forget.md)). |
| `MCP_SECRET` | No | unset (endpoint off) | `src/routes/mcp.ts` | Enables the remote MCP endpoint at `/mcp`. Clients authenticate with `Authorization: Bearer <MCP_SECRET>` ([ADR-015](../decisions/ADR-015-remote-mcp-endpoint.md)). |
| `NODE_ENV` | No | `production` in the Docker image | not read by app code | Conventional only. Set by the `Dockerfile` and `docker-compose.yml`. |

## Frontend dev server (`packages/app`)

| Variable | Required | Default | Read in | Purpose |
|---|---|---|---|---|
| `API_TARGET` | No | `http://localhost:3100` | `vite.config.ts` | Target of the Vite dev proxy for `/api`. Pass it in the shell, e.g. `API_TARGET=http://localhost:8080 pnpm dev`. |

The production frontend has no build-time variables. It calls the API on the same origin under `/api`.

## Stdio MCP server (`packages/mcp`)

| Variable | Required | Default | Read in | Purpose |
|---|---|---|---|---|
| `BETEL_EMAIL` | Yes | none (exits) | `src/index.ts` | Admin account email used to log in to the API. |
| `BETEL_PASSWORD` | Yes | none (exits) | `src/index.ts` | Password for that account. |
| `BETEL_API_URL` | No | `http://localhost:3100/api` | `src/index.ts` | Base URL of the API, including the `/api` prefix. |

## Docker Compose only (`docker-compose.yml`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DB_PASSWORD` | Yes | none | Password for the bundled `db` (PostgreSQL 16) service. The containerised app builds its `DATABASE_URL` from it. |
| `APP_HOST_PORT` | No | `8080` | Host port mapped to the app container's port 80. |
| `DB_HOST_PORT` | No | `5432` | Host port (bound to `127.0.0.1`) for the bundled PostgreSQL. Lets `pnpm dev:api` on the host use it. |

`DATABASE_URL` from `.env` is **not** passed to the app container. It points at `localhost` for host development, while the container always uses the `db` service.

## Removed variables

The following appeared in earlier templates. No code reads them:

- `CORS_ORIGIN`: CORS is configured with `origin: true` in `src/index.ts`.
- `SEED_ALLOWED`
- `RESEND_API_KEY`, `EMAIL_FROM`: reserved for the planned email features (FR-030, FR-031). Re-add them when the integration ships.
