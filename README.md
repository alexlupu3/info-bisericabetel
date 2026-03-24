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
- `packages/admin/` — React SPA for admin operations (content management, media library, site/location settings).
- `packages/pwa/` — Public-facing Progressive Web App served to church members.

## Key Admin Routes
- `/` (Content) — create, edit, order content items and groups
- `/media` — browse uploaded images, view usage, delete unused files
- `/locations` — manage site settings
- `/analytics` — site visit and link click analytics (lifetime totals + daily breakdown, accessible to all admins)

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
# Public PWA (http://localhost:5173)
pnpm dev

# API server (http://localhost:3000)
pnpm dev:api

# Admin SPA (http://localhost:5174)
pnpm --filter admin dev
```

Copy `.env.example` (if present) to `packages/api/.env` and fill in the required values before starting the API.

---

## Build

```bash
# Build everything (pwa + admin + api)
pnpm build:all

# Or build individually
pnpm build          # PWA only  → packages/pwa/dist/
pnpm build:admin    # Admin     → packages/admin/dist/
pnpm build:api      # API       → packages/api/dist/
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
| `pnpm deploy` | Build + deploy all packages |
| `pnpm deploy:pwa` | Build + deploy PWA only |
| `pnpm deploy:admin` | Build + deploy Admin SPA only |
| `pnpm deploy:api` | Build + deploy API + restart service |

Each deploy command builds the package(s) locally, rsyncs `dist/` to the server staging area, and restarts the relevant service. Migrations run automatically on API startup — no manual step needed.

---

## Docker

A `Dockerfile` (multi-stage) and `docker-compose.yml` are included for running the full stack in containers.

```bash
cp example.env .env        # fill in DB_PASSWORD, JWT_SECRET, CORS_ORIGIN
docker compose up -d --build
```

This starts three services: `db` (PostgreSQL 16), `api` (Fastify), and `nginx` (serves PWA + Admin, proxies `/api/`).

### CapRover

A `captain-definition` file is included at the repo root so the app can be deployed directly to a [CapRover](https://caprover.com) instance.

Two adjustments are needed when deploying on CapRover:

**1. Database** — CapRover has a one-click PostgreSQL app in its marketplace. If you provision the database there, remove the `db` service from `docker-compose.yml` and set `DATABASE_URL` as an environment variable in the CapRover app dashboard pointing to the CapRover-managed instance.

**2. Port mapping** — CapRover manages its own Nginx reverse proxy, so the `ports` directive on the `nginx` service in `docker-compose.yml` will conflict with it. Remove the `ports` entry and instead set the **Container HTTP Port** to `80` in the CapRover app settings — CapRover will route external traffic through its own load balancer.

---

## Working Rule
Important decisions should not live only in chat. Record durable decisions in `docs/decisions/` and active context in `memory/`.
