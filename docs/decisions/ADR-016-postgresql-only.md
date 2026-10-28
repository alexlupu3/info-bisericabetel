# ADR-016: PostgreSQL as the Only Supported Database

- **Status:** Accepted
- **Date:** 2026-10-17
- **Supersedes:** the "Database portability" constraint ("must support PostgreSQL and MySQL at minimum … No raw SQL tied to a single engine dialect") in `docs/architecture/constraints.md` and `docs/architecture/overview.md`, and the database-swappability clause of NFR-008

## Context

The original architecture docs required database portability: the system had to run on PostgreSQL and MySQL, use no engine-specific SQL, and switch engines through configuration alone. The aim was to avoid vendor lock-in.

The code never met that constraint, and over time it has come to depend on PostgreSQL in many places:

- **Driver and ORM dialect:** `postgres` (postgres-js) with `drizzle-orm/postgres-js` (`packages/api/src/db/client.ts`). The schema uses `pgTable`, `jsonb` and other `drizzle-orm/pg-core` types (`packages/api/src/db/schema.ts`).
- **Hand-written PostgreSQL migrations:** `packages/api/src/db/migrations/NNNN_name.sql` is plain PostgreSQL DDL/DML applied by a custom runner (`db/migrate.ts`), not generated per dialect. It uses `JSONB`, `TIMESTAMPTZ`, `gen_random_uuid()`, partial indexes (`WHERE … IS NOT NULL`, `WHERE state = 'deleted'`) and JSONB operators.
- **Queries in route handlers:** JSONB path operators (`data->>'thumbnail'`, `data->>'endDate'`), casts such as `::date` and `::int`, `NOW() AT TIME ZONE 'Europe/Bucharest'` (public visibility windows in `routes/content.ts`), `AT TIME ZONE <tz>` bucketing in analytics (the viewer's time zone, see ADR-017), and `pg_advisory_xact_lock(1001)` to serialise ordering inserts.
- **Product features built on JSONB:** per-site link overrides (ADR-007), media usage detection (ADR-003) and translation merging (ADR-014) all rely on JSONB semantics.

The project is deployed only to a self-hosted CapRover VPS with a PostgreSQL container, and nobody has asked for MySQL.

## Options Considered

1. **Keep the portability constraint and refactor towards it.** Replace JSONB with portable columns or tables, remove raw SQL, and maintain migrations per dialect. This would be a large rewrite with no user-visible benefit, and it would undo several accepted ADRs.
2. **Keep the constraint on paper.** This leaves the documentation contradicting the code and misleads anyone planning changes.
3. **Formally adopt PostgreSQL as the only supported database (chosen).**

## Decision

PostgreSQL is the only supported database. Engine-specific PostgreSQL features (JSONB, `TIMESTAMPTZ`, partial indexes, advisory locks, `AT TIME ZONE`, raw SQL through Drizzle's `sql` tag) may be used freely where they make the code simpler or faster.

The "no vendor lock-in" goal still holds at the level that matters: PostgreSQL is open source and self-hostable on any Linux VPS, and the system must not depend on a managed or proprietary database service (for example, no provider-specific extensions that exist only in a hosted offering).

## Consequences

- `docs/architecture/constraints.md` and `docs/architecture/overview.md` now state "PostgreSQL only". NFR-008 in `docs/product/requirements.md` is updated to match.
- New migrations stay hand-written PostgreSQL SQL in `packages/api/src/db/migrations/` (see `AGENTS.md` for the conventions).
- Moving to another engine in the future would mean a deliberate rewrite of the schema, migrations and raw queries, not a configuration change. This is an accepted cost.
- Reviewers no longer need to flag PostgreSQL-specific SQL as a constraint violation.
