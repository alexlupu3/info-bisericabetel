# Decision Records

This directory holds the project's durable Architecture Decision Records (ADRs).

## Naming

- `ADR-NNN-short-kebab-title.md`, numbered sequentially with three digits.
- Use the next free number and never reuse or share a number. If a collision is found, renumber the newer ADR and record that in its metadata (see ADR-014).
- Add every new ADR to the index below in the same branch.

## Template

```markdown
# ADR-NNN: Title

- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXX
- **Date:** YYYY-MM-DD
- **Supersedes:** ADR-XXX or the constraint/requirement replaced (omit if none)
- **Related:** links to related ADRs (optional)
- **Implements:** FR-/NFR- IDs (optional)

## Context
Why a decision was needed: the problem, forces and constraints.

## Options Considered
The alternatives, with pros and cons. May be omitted only when there was genuinely one option.

## Decision
What was chosen and the rules that follow from it.

## Implementation (optional)
Key files, endpoints, schema changes.

## Consequences
What becomes easier or harder, risks, follow-ups.

## Update History / Amendments (optional)
Dated entries for later changes that refine (not reverse) the decision.
A reversal gets a new ADR that supersedes this one.
```

Metadata is a bullet list directly under the title. Do not use YAML front matter or `## Status` / `## Date` sections.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](ADR-001-project-knowledge-structure.md) | Project knowledge structure | Accepted |
| [ADR-002](ADR-002-group-management-consolidated-into-content-page.md) | Group management consolidated into the Content page | Accepted |
| [ADR-003](ADR-003-image-library-management.md) | Image / media library management | Accepted |
| [ADR-004](ADR-004-drag-and-drop-50-percent-threshold.md) | Drag-and-drop 50% threshold | Accepted |
| [ADR-005](ADR-005-merge-pwa-admin-into-app.md) | Merge PWA and admin into a single app package | Accepted |
| [ADR-006](ADR-006-single-container-deployment.md) | Single-container deployment | Accepted |
| [ADR-007](ADR-007-per-site-link-overrides-client-side-resolution.md) | Per-site link overrides resolved client-side in JSONB | Accepted |
| [ADR-008](ADR-008-analytics-dashboard-recharts.md) | Analytics dashboard with Recharts | Accepted |
| [ADR-009](ADR-009-site-exclusive-content-dedicated-column.md) | Site-exclusive content: dedicated nullable column | Accepted |
| [ADR-010](ADR-010-ai-auto-translation-fire-and-forget.md) | AI auto-translation as a fire-and-forget background job | Accepted |
| [ADR-011](ADR-011-short-link-dynamic-url-resolution.md) | Short link URL resolved dynamically at redirect time | Accepted |
| [ADR-012](ADR-012-mcp-server.md) | Stdio MCP server via the HTTP API with JWT authentication | Accepted |
| [ADR-013](ADR-013-http-cache-strategy.md) | HTTP caching strategy for the SPA frontend | Accepted |
| [ADR-014](ADR-014-i18n-strategy.md) | Internationalization strategy (formerly a duplicate ADR-009) | Accepted |
| [ADR-015](ADR-015-remote-mcp-endpoint.md) | Remote MCP endpoint inside the API process | Accepted |
| [ADR-016](ADR-016-postgresql-only.md) | PostgreSQL as the only supported database | Accepted |
| [ADR-017](ADR-017-timezone-policy.md) | Time zone policy: UTC storage, viewer-zone display, Romania event days | Accepted |
| [ADR-018](ADR-018-sql-console.md) | Super-admin SQL console with a dedicated role and an application-level guard | Accepted |
| [ADR-019](ADR-019-custom-service-worker-inject-manifest.md) | Custom service worker via `injectManifest` | Proposed |
| [ADR-020](ADR-020-web-push-and-staged-rollout.md) | Web Push for new events and staged PWA rollout | Proposed |
| [ADR-021](ADR-021-rss-event-feed.md) | RSS 2.0 event feed: format, link semantics and caching | Proposed |
| [ADR-022](ADR-022-server-side-head-injection-and-content-snapshot.md) | Server-side head injection and content snapshot for the public hub (no React SSR) | Proposed |
| [ADR-023](ADR-023-event-start-time-wall-clock.md) | Event start time as Bucharest wall-clock `HH:mm`; event-time helpers in `@betel/shared` | Proposed |
| [ADR-024](ADR-024-mcp-shared-tool-contract-and-service-layer.md) | MCP tool parity via a shared tool contract and an API service layer | Proposed |
| [ADR-025](ADR-025-short-link-preview-by-user-agent.md) | Short-link previews served to link-preview crawlers by User-Agent; humans keep the 302 | Proposed |
