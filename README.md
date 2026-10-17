# info.bisericabetel

Information hub for **Biserica Baptistă Betel, Cluj-Napoca**, a multi-site church. Members reach it through QR codes and direct links. The public side is a mobile-first PWA that shows upcoming events, announcements and curated links, either for one church site (`/<site-slug>`) or for all sites (`/`). The admin tool at `/admin` is where staff create, order, schedule, translate and publish that content, manage media and sites, and read analytics. See [docs/product/vision.md](docs/product/vision.md).

Everything ships as one Fastify server that also serves the built React app, deployed as a single container on CapRover.

## Repository map

| Path | Contents |
|---|---|
| `packages/api/` | Fastify + Drizzle ORM + PostgreSQL backend. Serves `/api/*`, `/s/:code` short links, `/uploads/*`, `/mcp`, and the built frontend. |
| `packages/app/` | React + Vite app: public PWA at `/` and `/:siteSlug`, admin tool at `/admin/*`. The admin code is lazy-loaded, so public visitors never download it. |
| `packages/mcp/` | Stdio MCP server for desktop MCP clients ([MCP](#mcp)). |
| `packages/shared/` | Types shared between the packages. |
| `cypress/` | End-to-end tests for the frontend. |
| `docs/product/` | Vision, [requirements](docs/product/requirements.md), user flows, roadmap. |
| `docs/domain/` | Glossary, entities, business rules, content model. |
| `docs/architecture/` | Overview, constraints, integrations, security, [deployment](docs/architecture/deployment.md), [configuration](docs/architecture/configuration.md). |
| `docs/decisions/` | Architecture Decision Records (ADRs). |
| `memory/` | Fast-moving project context: current decisions, assumptions, open questions. |

## Features

- **Public hub (PWA):** a single ordered page of cards, posters, rich text and YouTube embeds, filtered per site, in several languages. See [requirements](docs/product/requirements.md) (FR-001 to FR-011) and the [content model](docs/domain/content-model.md).
- **Content admin:** drag-and-drop ordering, groups, draft/published/archived/deleted states, scheduling and expiry, duplication, per-site link overrides. See the Publishing and "Admin Tool — Content Management" sections of [requirements](docs/product/requirements.md) and ADR-002, ADR-004, ADR-007, ADR-009.
- **Media library:** image uploads up to 5 MB (any `image/*`). They are re-encoded to WebP, and an image cannot be deleted while it is in use. See FR-017 and ADR-003.
- **Short links:** admin-created `/s/<code>` links per content item, each labelled with a distribution channel. Clicks are logged and the link redirects to the item's current URL. See FR-044 and ADR-011.
- **Analytics:** site visits and link clicks per site, with period comparison, per-item daily charts and CSV export. See FR-024, FR-025, FR-043 and ADR-008.
- **i18n and AI translation:** Romanian is the default. Additional languages are managed in `/admin/translations`. With `OPEN_ROUTER_API_KEY` set, content and groups are auto-translated in the background. See FR-047, FR-037 to FR-041, [ADR-014](docs/decisions/ADR-014-i18n-strategy.md) and ADR-010.
- **Error capture:** frontend errors caught by the React ErrorBoundary are listed in `/admin/error-logs`. See FR-045.

### Admin routes

All routes live under `/admin`. The ones marked ★ are visible to the **super-admin** only.

| Route | Purpose |
|---|---|
| `/admin/setup` | One-time creation of the first super-admin. Reachable only while logged out. |
| `/admin/content` | Create, edit, order and publish content items and groups. This is the default page. |
| `/admin/archive` | Soft-deleted items: restore them to draft or delete them permanently. |
| `/admin/media` | Media library: browse uploads, see where each is used, delete unused ones. |
| `/admin/analytics` | Analytics dashboard. |
| `/admin/locations` ★ | Manage church sites. |
| `/admin/users` ★ | Manage admin accounts and reset passwords. |
| `/admin/logs` ★ | Audit log. |
| `/admin/error-logs` ★ | Captured frontend errors. |
| `/admin/translations` ★ | Languages and UI string translations. |

`/admin/groups` still exists as a route but is not in the navigation. Groups are managed on the Content page (ADR-002).

## Quick start (local development)

**Prerequisites:** Node.js 24 (see `.nvmrc`), pnpm 10 (pinned via `packageManager`; `corepack enable` picks it up), and Docker for the local PostgreSQL. Any PostgreSQL 16 instance also works.

```bash
# 1. Configure: set JWT_SECRET, DB_PASSWORD, and the password inside DATABASE_URL
cp example.env .env

# 2. Start PostgreSQL 16 (bundled compose service, exposed on 127.0.0.1:5432)
docker compose up -d db

# 3. Install dependencies
pnpm install

# 4. Start the API on http://localhost:3100 (runs migrations on startup)
pnpm dev:api

# 5. In a second terminal: start the PWA + admin on http://localhost:5173
pnpm dev
```

Vite proxies `/api` to `localhost:3100`. Both the public hub (`/`) and the admin tool (`/admin`) are served from port 5173.

**6. Create the first admin.** Pick one of these:

- Open http://localhost:5173/admin/setup and submit email and password. This calls `POST /api/setup`, which works only while no user exists.
- Run `pnpm --filter @betel/api seed-admin <email> <password>`. The command reads `DATABASE_URL` from the root `.env`.

Both create a **super-admin**. Further admins are created in `/admin/users`.

The minimum variables are `DATABASE_URL`, `JWT_SECRET` and (for compose) `DB_PASSWORD`. Every variable is documented in [docs/architecture/configuration.md](docs/architecture/configuration.md).

## Build

```bash
pnpm build:all    # every package with a build script (app, api, mcp)
pnpm build        # app only → packages/app/dist/
pnpm build:api    # api only → packages/api/dist/ (esbuild bundle + migrations)
pnpm lint         # type-check all packages (tsc --noEmit)
```

To run the production image locally, use `docker compose up -d --build`. The app is then available on http://localhost:8080 (the container listens on 80, and the host port is set by `APP_HOST_PORT`).

## Tests

Tests are Cypress end-to-end specs in `cypress/e2e/`. **Every spec stubs the API with `cy.intercept`**, so you only need the Vite dev server (`baseUrl: http://localhost:5173`). The API and database are not needed.

```bash
pnpm dev          # in one terminal
pnpm test         # headless run
pnpm test:open    # interactive runner
```

Known gaps: the backend (API routes, database, migrations) has **no automated tests**, and there is **no CI**. Run `pnpm lint` and `pnpm test` yourself before committing.

## Deploy

Production is a single Docker container on [CapRover](https://caprover.com). `captain-definition` points CapRover at the root `Dockerfile`, CapRover builds the image from source, and the container listens on port **80**. Migrations run automatically on startup. Deploys are manual: there is no CI/CD pipeline.

```bash
pnpm lint && pnpm test   # verify
pnpm release             # version bump + changelog + tag (see below)
caprover deploy          # from a clean checkout of main; or upload via the CapRover dashboard
```

The first-time CapRover setup (database, env vars, container port 80, persistent uploads volume, first admin) is in [docs/architecture/deployment.md](docs/architecture/deployment.md). See also [ADR-006](docs/decisions/ADR-006-single-container-deployment.md).

There are no `pnpm deploy*` scripts. `pnpm deploy` is a pnpm built-in command and does not deploy this app.

## Release and changelog

`pnpm release` runs [release-it](https://github.com/release-it/release-it) with `@release-it/conventional-changelog` (configured in `.release-it.json`). It bumps the version in the root `package.json`, regenerates `CHANGELOG.md` from Conventional Commit messages, commits `chore(release): vX.Y.Z`, tags `vX.Y.Z` and pushes. It needs a clean working tree. `pnpm release:dry` previews the release without changing anything.

`CHANGELOG.md` is generated. **Do not edit it by hand.** Write good commit messages instead (`feat:`, `fix:`, `perf:` and so on). The root version is also what `GET /health` reports.

## MCP

The project offers two ways to manage content from an MCP client. Both expose the same 8 tools:

| Tool | Description |
|---|---|
| `list_sites` | List church sites and their slugs |
| `list_groups` | List content groups |
| `list_media` | List images in the media library |
| `upload_media` | Upload a base64 image; returns a relative `/uploads/<uuid>.webp` URL. Prefix your public origin (`https://<your-domain>/uploads/…`) before passing it as a card `thumbnail`, which must be an absolute URL (see [integrations.md](docs/architecture/integrations.md#mcp-ai-agent-integration)) |
| `list_cards` | List card content items |
| `create_card` | Create a card (in draft state) |
| `update_card` | Update fields of an existing card |
| `publish_card` | Publish a draft card |

### Remote endpoint (`/mcp`) for Claude web, iOS and other remote clients

The API serves an MCP endpoint at `/mcp` (Streamable HTTP transport). It is enabled only when `MCP_SECRET` is set, and clients authenticate with `Authorization: Bearer <MCP_SECRET>`. In the client, add a custom integration or connector with URL `https://<your-domain>/mcp` and that Bearer token. It runs inside the API container, so there is nothing extra to deploy. See [ADR-015](docs/decisions/ADR-015-remote-mcp-endpoint.md).

### Stdio server (`packages/mcp`) for desktop clients

This server is for local MCP clients that can spawn a process, such as Claude Desktop or Claude Code. It does **not** work from the Claude web app. It logs in to the admin API with a regular admin account. See [ADR-012](docs/decisions/ADR-012-mcp-server.md). Environment variables: [configuration.md → Stdio MCP server](docs/architecture/configuration.md#stdio-mcp-server-packagesmcp).

```bash
pnpm --filter @betel/mcp build   # → packages/mcp/dist/index.js
pnpm --filter @betel/mcp dev     # run from source with tsx
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "betel": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"],
      "env": {
        "BETEL_API_URL": "https://<your-domain>/api",
        "BETEL_EMAIL": "admin@example.com",
        "BETEL_PASSWORD": "your-password"
      }
    }
  }
}
```

## Scripts

`scripts/` is gitignored except `scripts/generate-icons.mjs`. That script generates placeholder PWA icons into `packages/app/public/icons/` and overwrites the real ones. It needs `canvas` installed ad hoc; see the header comment in the script.

## Working rule

Important decisions should not live only in chat. Record durable decisions in `docs/decisions/` and active context in `memory/`.
