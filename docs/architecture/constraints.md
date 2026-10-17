# Technical Constraints

## Known Constraints
- **No vendor lock-in:** must not depend on any specific cloud provider, managed PaaS, or proprietary service. The full stack must be self-hostable on a standard Linux VPS. Optional third-party APIs are allowed only when the system keeps working without them (for example OpenRouter for AI translation; see `integrations.md`).
- **PostgreSQL only:** PostgreSQL is the single supported database. PostgreSQL-specific SQL (JSONB, `TIMESTAMPTZ`, partial indexes, advisory locks, `AT TIME ZONE`) is allowed. Migrations are hand-written PostgreSQL SQL. This replaces the former "must support PostgreSQL and MySQL, no engine-specific SQL" constraint; see [ADR-016](../decisions/ADR-016-postgresql-only.md).
- **VPS hosting via CapRover:** production runs as a single Docker container deployed to a CapRover instance on a VPS. CapRover manages TLS, its own reverse proxy, and container lifecycle. The Fastify API process serves the frontend SPA, uploaded media and the API routes, so no separate nginx container is needed. See `deployment.md` for details.
- **No hardcoded configuration:** sites, languages and admin accounts are data and must never be hardcoded in the codebase. Runtime configuration comes from environment variables, documented in [configuration.md](configuration.md).
- **Content types are code-defined but must stay extensible (FR-011):** the set of types is the `ContentType` union in `packages/shared/src/index.ts`, not a table. Adding a type means touching the shared types, API validation (`REQUIRED_FIELDS` and the duplicate endpoint's `mediaFields` map (BR-010) in `packages/api/src/routes/admin/content.ts`; media usage detection in `routes/admin/media.ts` if it stores an image), the admin form (`packages/app/src/admin/pages/ContentPage.tsx`) and the public renderer (`packages/app/src/public/components/content/ContentRenderer.tsx` plus a new item component). See [content-model.md](../domain/content-model.md).

## Implementation Guardrails
- **Performance:** fast load times on mobile are a first-class concern. PWA, efficient image handling, and minimal network payload are expected.
- **Accessibility:** no formal WCAG compliance required, but semantic HTML5, meaningful alt text, and logical heading structure must be maintained.
- **Localization:** the public hub is multilingual. Romanian is the default and fallback, and additional languages are managed as data by a super-admin ([ADR-014](../decisions/ADR-014-i18n-strategy.md)). The admin UI is Romanian-only and is not localized.
- **Maintainability:** dependency upgrades and feature additions must be achievable without structural rewrites. Modular architecture is required.
- **Scalability:** the system must handle thousands of concurrent users on Sunday mornings. Architecture choices must account for this without requiring expensive infrastructure.
- **Audit logging:** all content and configuration changes must be logged (who, what, when). This is a hard requirement (FR-023). Coverage is currently incomplete; see the gaps listed in `security.md`.
