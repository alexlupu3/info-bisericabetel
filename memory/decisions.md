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
