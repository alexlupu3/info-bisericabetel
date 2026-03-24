# Current Decisions

Use this file for recent decisions that need quick visibility. Promote durable decisions to `docs/decisions/` when they become stable or high impact.

## Entries
- Date: 2026-03-12
  Decision: The application will be a church information hub for Biserica Baptista Betel - Cluj-Napoca.
  Reason: This defines the core product purpose and target organization.
  Next action: Expand product scope, users, and content ownership details.

- Date: 2026-03-12
  Decision: The initial user access paths are QR codes and direct links.
  Reason: The app needs very low-friction entry for members in church contexts.
  Next action: Decide whether links can preselect a site or content category.

- Date: 2026-03-12
  Decision: The product must support both site-filtered views and an all-sites view.
  Reason: The church is multi-site, but members may still want church-wide visibility.
  Next action: Define how site selection and switching should work in the interface.

- Date: 2026-03-14
  Decision: A custom Claude Code skill named `frontend-design` will be added to the project. It embeds the church's style guide. This skill must be invoked when building public-facing pages to ensure visual consistency with the church's brand.
  Why: Keeps the style guide close to the code and makes it available to any AI agent working on the frontend.
  How to apply: Always invoke the `frontend-design` skill when working on the public hub UI.

- Date: 2026-03-16
  Decision: Group management is fully consolidated into the Content page. The "Grupuri" nav link has been removed. Admins create groups inline (title only) with a "+ Grup nou" button and delete them with "Șterge grup" on the group header. Items can be moved between groups via multi-container drag and drop. Deleted groups auto-migrate their items to the ungrouped section.
  Why: Groups serve purely as display containers for content items. Keeping group management on a separate page required unnecessary context switching. Inline management makes the group–item relationship immediately visible and actionable.
  See: ADR-002 for full options analysis and implementation notes.

- Date: 2026-03-17
  Decision: A dedicated `media` table tracks all uploaded files. Usage detection queries `content_items` JSONB fields rather than using foreign keys. Poster items gain an admin-only `name` field in `data.name`. A `/media` admin SPA route provides gallery view, usage filtering, and delete of unused images. Image URLs are immutable after upload.
  Why: FR-017 required a media library for reuse and cleanup. Foreign key approach conflicted with the extensible JSONB content model. JSONB scanning is simpler and sufficient for the current four content types.
  See: ADR-003 for full options analysis, implementation notes, and known limitations.

- Date: 2026-03-21
  Decision: The PWA hero header now displays the Betel symbol logo (`/icons/favicon-dark.svg`) above the page title, a subtitle with the app's purpose ("Rămâi la curent cu programul și activitățile bisericii Betel"), and a subtle muted link to `https://bisericabetel.com`.
  Why: Improves visual identity and gives first-time visitors immediate context about what the app is and who runs it.
  How: Logo is a white SVG rendered as an `<img>` with CSS class `.betel-logo`. `filter: invert(1)` is applied in light mode; no filter in dark mode. Both system preference and explicit `[data-theme]` overrides are handled in `index.css`.
