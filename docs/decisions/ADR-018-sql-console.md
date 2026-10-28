# ADR-018: Super-Admin SQL Console with a Dedicated Role and an Application-Level Guard

- **Status:** Accepted
- **Date:** 2026-10-26
- **Related:** [ADR-016](ADR-016-postgresql-only.md), [ADR-012](ADR-012-mcp-server.md)
- **Implements:** FR-049 (audit: FR-023)

## Context

Some data fixes and inspections have no admin page: correcting a mis-scoped row, checking a migration result, counting records. Until now they required SSH or `psql` access to the CapRover host. Super-admins want to do this from the admin tool, but raw SQL can destroy data and bypasses the API's business rules and audit logging (the reason ADR-012 routes MCP writes through the API).

## Options Considered

1. **Keep `psql`/SSH only.** Safest for the app, but needs server access, leaves no audit trail in the app, and blocks non-technical super-admins.
2. **A separate database role with its own login and pool.** Strongest isolation, but needs a new role, a second connection secret (documented in `configuration.md`) and a deployment step.
3. **Application-level console with a denylist guard and full auditing.** Same pool and role as the app, super-admin only, read-only by default, with a command filter, limits and a fail-closed audit entry. Rejected alone: a lexical filter cannot see side effects of permitted functions (PR review finding).
4. **Option 3 plus a `NOLOGIN` role entered with `SET LOCAL ROLE` (chosen).** Keeps the app's pool and login, but every query runs under `betel_sql_console`, so PostgreSQL enforces the privileges.

## Decision

Add `POST /api/admin/sql` and `/admin/sql` for super-admins (FR-049). Guard layers: super-admin check and rate limit; structural validation and exactly one statement; an always-on dangerous-command filter; a `READ ONLY` transaction by default, 10 s statement timeout and a 500-row cap enforced while fetching (cursor, `FETCH 501`); every query runs after `SET LOCAL ROLE betel_sql_console`, created by migration `0012_sql_console_role.sql` (DML on `public` tables, read-only on `users`, `audit_log` and `_migrations`, no read of `users.password_hash`, no DDL); a UI warning modal with a double confirmation within 5 seconds. Every run is audited as `sql_query` **before** execution, storing the complete query text (at most 20,000 characters), and the request fails closed if the audit insert fails. Blocked queries are logged as `sql_query_blocked`. Details: [security.md](../architecture/security.md) → "SQL console".

The **role is the primary boundary** for table and function privileges: PostgreSQL denies writes to the protected tables, `pg_read_file`, `CREATE TABLE` and `setval` even when the filter is bypassed. The filter is a token-level denylist and remains **defence in depth, not a sandbox**: it does not judge the safety of a permitted statement (for example `WHERE true`); the audit trail and the double confirmation carry that risk. DROP, TRUNCATE and ALTER are blocked even in write mode, and writes touching `users`, `audit_log`, `_migrations` or `pg_settings` are refused.

**Remaining escape path:** `session_user` is still the app's DB user, so `set_config('role', ...)`, `SET ROLE`, `RESET` or `UPDATE pg_settings` could switch back to the app role. Only the filter blocks these (read-only transactions also block the `pg_settings` update). A separate `LOGIN` role with its own connection pool is the remaining follow-up.

The migration needs `SUPERUSER` or `CREATEROLE`; without it, it only warns and the console returns 503 `kind: 'unavailable'` until a superuser runs the file (see [deployment.md](../architecture/deployment.md)).

## Implementation

- `packages/api/src/services/sql-console.ts` (validator, filter, runner), `packages/api/src/routes/admin/sql.ts`.
- `packages/app/src/admin/pages/SqlConsolePage.tsx`, `packages/app/src/admin/components/sql/SqlConfirmModal.tsx`.
- `packages/api/src/db/migrations/0012_sql_console_role.sql` (role and grants; no table changes). Types `SqlQueryRequest`, `SqlQueryResult`, `SqlQueryError` in `packages/shared`. No new environment variables.
- Cypress: `cypress/e2e/admin-sql-console.cy.ts` (API stubbed; backend behaviour is not covered by the suite).

## Consequences

- Super-admins can inspect and fix data without server access, with a complete audit trail.
- The console bypasses business rules (soft-delete, group-delete cascade, translation jobs); `docs/architecture/security.md` lists this as a known risk. Password hashes are not readable through it.
- Deployment gains a privilege requirement for the migration (`SUPERUSER` or `CREATEROLE`).
- The role-switch-back path remains; the follow-up is option 2 (a separate `LOGIN` role and pool).
- New tables are covered automatically by `ALTER DEFAULT PRIVILEGES`, but new sensitive tables or columns must be excluded from the role explicitly.
- The filter must be kept in step with new PostgreSQL features and with the tables it protects.
