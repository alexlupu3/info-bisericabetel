# Technical Constraints

## Known Constraints
- **No vendor lock-in:** must not depend on any specific cloud provider, managed PaaS, or proprietary service. The full stack must be self-hostable on a standard Linux VPS.
- **Database portability:** must support PostgreSQL and MySQL at minimum via an ORM/connector. No raw SQL tied to a single engine dialect.
- **VPS hosting:** deploys to cloudlab — Ubuntu 24.04 LTS, Nginx reverse proxy, PostgreSQL 16 available, no Docker. Backend must run as a native systemd service. See `deployment.md` for full details.
- **No hardcoded configuration:** site list, content types, and admin accounts are all data — never hardcoded in the codebase.

## Implementation Guardrails
- **Performance:** fast load times on mobile are a first-class concern. PWA, efficient image handling, and minimal network payload are expected.
- **Accessibility:** no formal WCAG compliance required, but semantic HTML5, meaningful alt text, and logical heading structure must be maintained.
- **Localization:** no i18n system needed. Content is stored and displayed as-is. Admin UI is in English.
- **Maintainability:** dependency upgrades and feature additions must be achievable without structural rewrites. Modular architecture is required.
- **Scalability:** the system must handle thousands of concurrent users on Sunday mornings. Architecture choices must account for this without requiring expensive infrastructure.
- **Audit logging:** all content and configuration changes must be logged (who, what, when). This is a hard requirement, not optional.
