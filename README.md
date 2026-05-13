# info.bisericabetel

This repository is the root for a production-ready application and its supporting project knowledge.

## Repository Map
- `docs/product/` contains product vision, requirements, user flows, and roadmap notes.
- `docs/domain/` contains glossary terms, entities, business rules, and content model notes.
- `docs/architecture/` contains technical direction, constraints, integrations, security, and deployment notes.
- `docs/decisions/` contains Architecture Decision Records (ADRs).
- `memory/` contains fast-moving project memory such as current decisions, assumptions, and open questions.

## Packages
- `packages/api/` — Fastify backend; handles content, admin, media, and location routes.
- `packages/app/` — Unified React application: public PWA (at `/`) and admin tool (at `/admin/*`) in a single Vite build. Admin JS is code-split via `React.lazy` so public users never download it.
- `packages/mcp/` — MCP (Model Context Protocol) server that exposes content management tools to the Claude desktop/web app. See [MCP Setup](#mcp-model-context-protocol-server) below.

## Key Admin Routes
- `/` (Content) — create, edit, order content items and groups
- `/archive` — view soft-deleted content items; restore to draft or permanently delete
- `/media` — browse uploaded images, view usage, delete unused files
- `/locations` — manage site settings
- `/analytics` — interactive analytics dashboard: time-frame comparison (day/week/month), manual start date picker ("De la") for custom date-range analysis, stat cards with % change vs. prior period, dual-line trend chart, per-item daily-clicks modal with stacked area chart (website + per-short-link layers), per-item CSV export with source column (website vs. short link label), and site filter (default "Toate" shows cross-site totals; selecting a site scopes all stats to that site); accessible to all admins
- `/translations` — super-admin only; manage supported languages and translate all public UI strings; content items also support per-language translation via the content edit form
- `/error-logs` — super-admin only; view application errors captured by the React ErrorBoundary; supports pagination (50 per page) and filtering by site slug; columns: date/time, site, URL, message, stack trace, device info (all expandable)

## Short Link Tracking

Admins can create multiple short links per content item (e.g. `betel.ro/s/abc123`), each labeled with a distribution channel (e.g. "WhatsApp Manastur", "QR cod intrare"). Clicking a short link logs the click server-side and redirects to the content item's current destination URL. This allows admins to compare traffic from different channels for the same content.

Key behaviors:
- Short links are created on demand by admins only — no auto-creation.
- At redirect time the server reads the current `data.link` from the content item, or `data.siteLinks[siteSlug]` if a site override is set on the short link. If no URL resolves, the redirect falls back to `/`.
- Any short link code not found in the database redirects to `/`.
- When a content item is permanently hard-deleted, its short links are cascade-deleted. Soft-deleted and archived items retain their short links.
- Public-page link clicks continue to fire client-side events as before — existing website tracking is unchanged.

The content item editor gains a "Link-uri scurte" tab alongside the existing "Editează" tab. The analytics Content clicks table shows Website clicks, Short link clicks, and Total columns. The per-item daily modal uses a stacked area chart. The CSV export includes a "Sursa" (source) column and a "Cod link scurt" column.

## AI Auto-Translation

When `OPEN_ROUTER_API_KEY` is set, the API automatically generates first-pass translations for content items and groups into all enabled non-default languages whenever they are created or updated. Translation runs as a background job (after the HTTP response is returned) using Claude Haiku via OpenRouter and does not affect admin response times. AI-generated translations can be reviewed and overridden at any time via `/translations`. If the key is not set the feature is silently disabled — no errors, no changed behavior.

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm i -g pnpm`)
- **PostgreSQL** 16 (local or remote)

Install dependencies from the repo root:

```bash
pnpm install
```

---

## Development

```bash
# PWA + Admin (http://localhost:5173)
pnpm dev

# API server (http://localhost:3000)
pnpm dev:api
```

Both the public PWA (`/`) and admin tool (`/admin`) are served from the same Vite dev server on port 5173.

Copy `.env.example` (if present) to `packages/api/.env` and fill in the required values before starting the API.

---

## Build

```bash
# Build everything (app + api)
pnpm build:all

# Or build individually
pnpm build          # PWA + Admin → packages/app/dist/
pnpm build:api      # API         → packages/api/dist/
```

---

## Tests

Tests use [Cypress](https://cypress.io) and require both the PWA dev server and the API to be running.

```bash
# Run all end-to-end tests headlessly (CI mode)
pnpm test

# Open the Cypress interactive runner
pnpm test:open
```

All tests must pass before committing. Fix any failures before pushing.

---

## Deploy

Deployment is manual to the production server via deploy scripts. There is no automated CI/CD pipeline.

> **Note — native dependencies:** `sharp` (image processing) uses platform-specific native binaries and cannot be bundled by esbuild. The build generates a minimal `dist/package.json` declaring it as a dependency, and the deploy script runs `npm install` on the server so the correct Linux binary is fetched automatically. No manual intervention is needed.

### Typical workflow

```bash
# 1. Run tests
pnpm test

# 2. Commit (use the /conventional-commit skill)

# 3. Deploy everything
pnpm deploy
```

### Deploy commands

| Command | What it does |
|---|---|
| `pnpm deploy` | Build + deploy all packages (app + api) |
| `pnpm deploy:app` | Build + deploy unified PWA + Admin only |
| `pnpm deploy:api` | Build + deploy API + restart service |

Each deploy command builds the package(s) locally, rsyncs `dist/` to the server staging area, and restarts the relevant service. Migrations run automatically on API startup — no manual step needed.

---

## Docker (local / compose)

A `Dockerfile` (multi-stage) and `docker-compose.yml` are included for running the full stack in containers locally.

```bash
cp example.env .env        # fill in DB_PASSWORD, JWT_SECRET, UPLOADS_DIR
docker compose up -d --build
```

This starts two services: `db` (PostgreSQL 16) and `app` (Fastify — serves both the frontend SPA and API routes). No separate nginx container is needed; the Fastify process handles everything.

### CapRover (production)

A `captain-definition` file is included at the repo root so the app can be deployed directly to a [CapRover](https://caprover.com) instance as a **single app**.

**Setup steps:**

**1. Database** — provision PostgreSQL via CapRover's one-click marketplace (or use any external PostgreSQL instance). Set `DATABASE_URL` as an environment variable in the CapRover app dashboard.

**2. Environment variables** — set the following in the CapRover app dashboard:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Min 32 chars — signs JWT tokens |
| `UPLOADS_DIR` | Absolute path for media storage inside the container (e.g. `/uploads`) |
| `NODE_ENV` | `production` |
| `OPEN_ROUTER_API_KEY` | Optional — enables AI auto-translation of content and groups on create/update (Claude Haiku via OpenRouter) |
| `MCP_SECRET` | Optional — enables the `/mcp` endpoint; set to a strong random string and use the same value as the Bearer token in Claude iOS |

**3. Container HTTP Port** — set to `3100` in the CapRover app settings. CapRover routes external HTTPS traffic through its own load balancer to this port.

**4. Persistent volume** — mount a persistent volume at the path you set for `UPLOADS_DIR` so uploaded media survives container redeploys.

---

## MCP (Model Context Protocol) Server

`packages/mcp/` is a stdio MCP server that lets you manage church content directly from the Claude desktop or web app.

### Available tools

| Tool | Description |
|---|---|
| `list_sites` | List all church sites and their slugs |
| `list_groups` | List all content groups |
| `list_media` | List images in the media library |
| `list_cards` | List all card content items |
| `create_card` | Create a new card (starts as draft) |
| `update_card` | Update fields on an existing card |
| `publish_card` | Publish a draft card to the public site |

### Configuration

The MCP server authenticates with the existing admin API using credentials provided via environment variables.

| Variable | Required | Description |
|---|---|---|
| `BETEL_EMAIL` | yes | Admin account email |
| `BETEL_PASSWORD` | yes | Admin account password |
| `BETEL_API_URL` | no | Base API URL (default: `http://localhost:3000/api`) |

### Claude iOS (and Claude.ai web) setup

The API exposes an MCP endpoint at `POST /mcp` using the Streamable HTTP transport. Enable it by setting `MCP_SECRET` to a strong random string in your deployment environment.

In Claude iOS: **Settings → Claude for Work → Add Integration**, then enter:
- **URL**: `https://your-deployed-api.com/mcp`
- **Authentication**: Bearer token → paste your `MCP_SECRET` value

No separate service to deploy — the MCP endpoint runs inside the existing Fastify API container.

### Claude Desktop setup

Add the following to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "betel": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"],
      "env": {
        "BETEL_API_URL": "https://your-production-api.example.com/api",
        "BETEL_EMAIL": "admin@betel.ro",
        "BETEL_PASSWORD": "your-password"
      }
    }
  }
}
```

Build the MCP server first:

```bash
pnpm --filter @betel/mcp build
```

For development with hot-reload:

```bash
pnpm --filter @betel/mcp dev
```

---

## Working Rule
Important decisions should not live only in chat. Record durable decisions in `docs/decisions/` and active context in `memory/`.
