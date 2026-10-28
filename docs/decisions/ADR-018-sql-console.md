# ADR-018: Super-Admin SQL Console with an Application-Level Guard

- **Status:** Accepted
- **Date:** 2026-10-26
- **Related:** [ADR-016](ADR-016-postgresql-only.md), [ADR-012](ADR-012-mcp-server.md)
- **Implements:** FR-049 (audit: FR-023)

## Context

Some data fixes and inspections have no admin page: correcting a mis-scoped row, checking a migration result, counting records. Until now they required SSH or `psql` access to the CapRover host. Super-admins want to do this from the admin tool, but raw SQL can destroy data and bypasses the API's business rules and audit logging (the reason ADR-012 routes MCP writes through the API).

## Options Considered

1. **Keep `psql`/SSH only.** Safest for the app, but needs server access, leaves no audit trail in the app, and blocks non-technical super-admins.
2. **A separate read-only database role and pool.** Strongest isolation, but needs a new role, a second `DATABASE_URL`-style secret (documented in `configuration.md`) and a deployment step; it also makes the console useless for the occasional write.
3. **Application-level console with a denylist guard and full auditing (chosen).** Same pool and role as the app, super-admin only, read-only by default, with a command filter, limits and a fail-closed audit entry.

## Decision

Add `POST /api/admin/sql` and `/admin/sql` for super-admins (FR-049). Guard layers: super-admin check and rate limit; structural validation and exactly one statement; an always-on dangerous-command filter; a `READ ONLY` transaction by default, 10 s statement timeout and 500-row cap; a UI warning modal with a double confirmation within 5 seconds. Every run is audited as `sql_query` **before** execution, and the request fails closed if the audit insert fails. Blocked queries are logged as `sql_query_blocked`. Details: [security.md](../architecture/security.md) → "SQL console".

The filter is a token-level denylist and is **defence in depth, not a sandbox**. It does not enforce the safety of a permitted statement (for example `WHERE true`); the audit trail and the double confirmation carry that risk. DROP, TRUNCATE and ALTER are blocked even in write mode, and writes touching `users`, `audit_log` or `_migrations` are refused.

## Implementation

- `packages/api/src/services/sql-console.ts` (validator, filter, runner), `packages/api/src/routes/admin/sql.ts`.
- `packages/app/src/admin/pages/SqlConsolePage.tsx`, `packages/app/src/admin/components/sql/SqlConfirmModal.tsx`.
- Types `SqlQueryRequest`, `SqlQueryResult`, `SqlQueryError` in `packages/shared`. No schema change and no new environment variables.
- Cypress: `cypress/e2e/admin-sql-console.cy.ts` (API stubbed; backend behaviour is not covered by the suite).

## Consequences

- Super-admins can inspect and fix data without server access, with a complete audit trail.
- The console bypasses business rules (soft-delete, group-delete cascade, translation jobs) and can read `users.password_hash`; it is a sharp tool and `docs/architecture/security.md` lists these as known risks.
- It runs with the app's own database role, so a filter bypass has the app's full rights. Follow-up option: a dedicated limited role and pool (option 2), if the console sees real use.
- The filter must be kept in step with new PostgreSQL features and with the tables it protects.
