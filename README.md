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

## Key Admin Routes
- `/` (Content) — create, edit, order content items and groups
- `/archive` — view soft-deleted content items; restore to draft or permanently delete
- `/media` — browse uploaded images, view usage, delete unused files
- `/locations` — manage site settings
- `/analytics` — interactive analytics dashboard: time-frame comparison (day/week/month), stat cards with % change vs. prior period, dual-line trend chart, per-item daily-clicks modal, and site filter (default "Toate" shows cross-site totals; selecting a site scopes all stats to that site); accessible to all admins
- `/translations` — super-admin only; manage supported languages and translate all public UI strings; content items also support per-language translation via the content edit form

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

**3. Container HTTP Port** — set to `3100` in the CapRover app settings. CapRover routes external HTTPS traffic through its own load balancer to this port.

**4. Persistent volume** — mount a persistent volume at the path you set for `UPLOADS_DIR` so uploaded media survives container redeploys.

---

## Working Rule
Important decisions should not live only in chat. Record durable decisions in `docs/decisions/` and active context in `memory/`.
