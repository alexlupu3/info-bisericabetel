# Business Rules

Record rules that must stay true regardless of implementation details.

## Rules
- BR-001: Content may belong to a specific church site or to the whole church.
- BR-002: Users must be able to access site-relevant content without losing the ability to view all church content.
- BR-003: Core information categories include events, important information, and bookmarked links.
- BR-004: Access paths should support both QR-code entry and direct-link entry.
- BR-005: When a group is scoped to specific sites, the entire group container (header and all items) is hidden for sites outside that scope. Group site scope takes precedence over individual item site scope. Items inside a site-scoped group are never visible on sites excluded by the group, regardless of their own site assignment.

## Source
- Stakeholder or document: initial product context provided by repository owner
- Date confirmed: 2026-03-12
- BR-005 added: 2026-03-17 (resolved during group site-scope implementation)
