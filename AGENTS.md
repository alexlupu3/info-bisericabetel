# AGENTS.md

Operating manual for any coding agent working in this repository. `CLAUDE.md` is a symlink to this file — edit `AGENTS.md` only.

## What this is

A content hub for Biserica Betel (a multi-site church). One public PWA serves all sites (`/` and `/:siteSlug`); an admin tool at `/admin/*` lets editors manage content items, groups, media, short links, translations and analytics. Sites (locations) are rows in the `sites` table, not code.

Stack: pnpm monorepo, Node 24 (see `.nvmrc`), TypeScript everywhere.
- `packages/api` — Fastify 5 + Drizzle ORM + PostgreSQL (`@betel/api`)
- `packages/app` — React 18 + Vite 6 + Tailwind PWA, public hub and admin in one build (`@betel/app`)
- `packages/mcp` — stdio MCP server that talks to the HTTP API (`@betel/mcp`)
- `packages/shared` — shared TypeScript types (`@betel/shared`)

Deployed as a single container on CapRover (the API process also serves the built app) — see `README.md`.

## Code map

| What | Where |
|------|-------|
| API entry, plugin/route registration | `packages/api/src/index.ts` |
| Public API routes | `packages/api/src/routes/*.ts` |
| Admin API routes | `packages/api/src/routes/admin/*.ts` |
| Remote MCP endpoint | `packages/api/src/routes/mcp.ts` |
| Business logic / background jobs | `packages/api/src/services/` |
| DB schema (Drizzle) | `packages/api/src/db/schema.ts` |
| SQL migrations | `packages/api/src/db/migrations/NNNN_name.sql` |
| Migration runner | `packages/api/src/db/migrate.ts` |
| Admin pages / components / API client | `packages/app/src/admin/{pages,components,api}/` |
| Public pages / components / hooks | `packages/app/src/public/{pages,components,hooks,context}/` |
| Public UI string keys | `packages/app/src/public/i18n/keys.ts` |
| Global styles and theme tokens | `packages/app/src/index.css` |
| Shared types | `packages/shared/src/index.ts` |
| Stdio MCP server | `packages/mcp/src/index.ts` |
| E2E tests | `cypress/e2e/*.cy.ts`, helpers in `cypress/support/` |

## Commands

```bash
pnpm install          # install all workspaces
cp example.env .env   # then fill in values; see docs/architecture/configuration.md
pnpm dev              # Vite app on http://localhost:5173 (proxies /api to :3100)
pnpm dev:api          # API on http://localhost:3100 (reads ../../.env, needs PostgreSQL)
pnpm lint             # tsc --noEmit in every package (typecheck only; no formatter/ESLint configured)
pnpm build            # build the app; pnpm build:api for the API; pnpm build:all for everything
pnpm test             # Cypress headless; requires `pnpm dev` running on :5173
pnpm test:open        # Cypress interactive runner
pnpm release          # release-it: bumps version, tags, regenerates CHANGELOG.md
```

Ports: Vite 5173, local API 3100, container 80. Every environment variable is documented in `docs/architecture/configuration.md` — add new ones there, not here.

Testing reality: every Cypress spec stubs the API with `cy.intercept`, so the API does not need to run for `pnpm test`, and backend behaviour is **not** covered by the suite. Verify API changes manually (or add tests that exercise them) and say so in your report.

## Database migrations

There is no drizzle-kit. To change the schema:
1. Hand-write the next file `packages/api/src/db/migrations/NNNN_short_name.sql` (zero-padded, next number after the highest existing one).
2. Update `packages/api/src/db/schema.ts` to match.
3. Start the API: `runMigrations()` (`src/db/migrate.ts`) applies unapplied files in filename order at startup, each in a transaction, and records them in `_migrations`.

Never edit a migration that has already been applied anywhere; add a new one. `*.sql` is gitignored except under the migrations folder.

## Conventions

- Files and folders: `kebab-case`; React components: `PascalCase` (`ContentPage.tsx`); variables/functions: `camelCase`. 2-space indentation.
- Small modules with one clear responsibility.
- **Admin UI copy is Romanian.** **Public UI strings** never get hard-coded: add a key to `packages/app/src/public/i18n/keys.ts` and render via `t()` from `useLanguage()` (`public/context/LanguageContext.tsx`) (translations live in the `ui_translations` table).
- Everything else in the repo — code, comments, docs, commit messages — is **English**.
- **Sites are data.** Never hard-code site slugs, names or accent colours; read them from the `sites` table / API (`sites.accent` drives per-site colour).
- Shared request/response types go in `packages/shared`.

## Workflow

- Multi-commit work happens on a feature branch named `<type>/<short-slug>` using the conventional-commit type: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/` (e.g. `feat/analytics-csv-export`).
- Atomic [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): imperative summary`. Scopes in use: `api`, `app`, `admin`, `public`, `mcp`, `shared`, `content`, `card`, `i18n`, `analytics`, `media`, `short-links`, `ai-translation`, `auth`, `cache`, `sw`, `pwa`, `docker`, `deploy`, `release` (full list and examples in the `conventional-commit` skill). Types `feat`/`fix`/`perf`/`refactor`/`style`/`build`/`ci` appear in the changelog; `docs`/`test`/`chore` are hidden.
- Tests: add/extend Cypress specs for every feature's happy flow, and a regression scenario for every bug fix when feasible.
- Before every commit: `pnpm lint` and `pnpm test` (with `pnpm dev` running) must be green. Fix failures; do not commit red.
- Never commit secrets, `.env` files, credentials, local deploy scripts under `scripts/` (gitignored except whitelisted ones) or uploads.
- Don't hand-edit `CHANGELOG.md` — it is generated by `pnpm release`.

## Documentation map

| Location | Purpose |
|----------|---------|
| `README.md` | Humans: overview, quick start, deploy |
| `docs/product/` | Vision, requirements (`FR-NNN`, unique IDs), user flows, roadmap |
| `docs/domain/` | **Single source of truth for domain rules**: entities, business rules, content model, glossary |
| `docs/architecture/` | Overview, constraints, integrations, security, deployment, `configuration.md` (env vars) |
| `docs/decisions/` | ADRs; template and index in `docs/decisions/README.md` |
| `memory/` | Open questions, assumptions and short-lived decisions not yet in an ADR — not a second copy of the docs |
| `CHANGELOG.md` | Generated; never edit by hand |

Rules:
- Update docs in the **same branch** as the code change they describe.
- Record significant or hard-to-reverse decisions as a new ADR (next free number) and add it to the index.
- Link to existing docs rather than duplicating their content.

## Claude Code specifics

Other agents can ignore this section.

- Break larger features into tasks and delegate them to subagents.
- Use the `knowledge-base-steward` agent (`.claude/agents/`) for task analysis before implementing, and again right before commit to update docs, ADRs and requirements.
- Project skills (`.agents/skills/`, symlinked into `.claude/skills/`):
  - `conventional-commit` — composing commits.
  - `frontend-design` — any UI or visual work in `packages/app` (new pages, components, styling, layout).
