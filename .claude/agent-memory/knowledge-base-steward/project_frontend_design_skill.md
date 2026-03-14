---
name: frontend-design skill decision
description: A custom Claude Code skill named frontend-design embeds the church style guide and must be invoked for all public-facing UI work
type: project
---

A custom Claude Code skill named `frontend-design` will be added to the project. It embeds the church's style guide.

**Why:** Keeps the style guide close to the code and makes it available to any AI agent working on the frontend, ensuring visual consistency with the church's brand without relying on external references.

**How to apply:** Always invoke the `frontend-design` skill before working on any public hub UI. This is recorded in `memory/decisions.md` (2026-03-14) and noted in the Frontend section of `docs/architecture/overview.md`.
