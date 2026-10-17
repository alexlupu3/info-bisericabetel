---
name: conventional-commit
description: 'Compose and create Conventional Commits for this repository. Use when staging and committing changes: covers the pre-commit checks from AGENTS.md, allowed types and repo scopes, how each type maps to CHANGELOG sections, message format, and examples.'
---

# Conventional commits for info-bisericabetel

> Local fork, originally from `github/awesome-copilot`, rewritten for this repo. Not tracked in a skills lock file; do not re-sync from upstream.

The changelog is generated from commit messages by `pnpm release` (release-it + `@release-it/conventional-changelog`, see `.release-it.json`), so the message format matters. Never edit `CHANGELOG.md` by hand.

## Workflow

1. **Run the checks first** (required by `AGENTS.md`):
   - `pnpm lint` — TypeScript typecheck across all packages.
   - `pnpm test` — Cypress; needs `pnpm dev` running on http://localhost:5173.
   Only continue when both are green. If they fail, fix the cause; do not commit red.
2. `git status` and `git diff` (or `git diff --cached`) to review the changes.
3. Split unrelated changes into separate atomic commits. Stage explicitly with `git add <file>` — never stage `.env`, secrets, local deploy scripts or uploads.
4. Write the message (format below). Show it to the user and commit only when they asked you to commit.
5. `git commit` with the message (use a heredoc or multiple `-m` flags for body/footer).

## Format

```
type(scope): imperative summary, lower case, no trailing period

Optional body: what and why, wrapped at ~72 chars.

Optional footer: BREAKING CHANGE: ..., Refs #123
```

- Summary in English, imperative mood ("add", not "added"), ideally under 72 characters.
- Breaking change: `type(scope)!: ...` and/or a `BREAKING CHANGE:` footer.

## Types and changelog sections

| Type | CHANGELOG section | Use for |
|------|-------------------|---------|
| `feat` | Features | New user-visible capability |
| `fix` | Bug Fixes | Bug fix |
| `perf` | Performance Improvements | Performance change, no behaviour change |
| `refactor` | Code Refactoring | Restructuring without behaviour change |
| `style` | Styles | Visual/CSS or formatting-only changes |
| `build` | Build System | Build tooling, Dockerfile, dependencies |
| `ci` | CI | CI/CD and deployment pipeline config |
| `docs` | hidden | Documentation only |
| `test` | hidden | Tests only |
| `chore` | hidden | Maintenance (release commits use `chore(release)`) |
| `revert` | — | Reverting a previous commit |

## Scopes

Use the narrowest scope that describes the change. Scopes established in this repo's history:

- Packages / surfaces: `api`, `app`, `admin`, `public`, `mcp`, `shared`
- Features / domains: `content`, `card`, `i18n`, `ai-translation`, `analytics`, `media`, `short-links`, `auth`, `cache`, `sw`, `pwa`
- Infrastructure: `docker`, `deploy`, `release`
- Docs: the topic they describe (e.g. `docs(domain)`, `docs(product)`, `docs(agents)`)

Prefer an existing scope over inventing a new one.

## Examples

```
feat(analytics): add CSV export for item statistics
fix(sw): exclude short links from service worker navigation fallback
feat(i18n): translate group titles via AI auto-translation
refactor(mcp): share HTTP client between tools
test(content): add regression spec for expired cards
docs(domain): clarify exclusive-site visibility rule
build(docker): copy migrations into runtime image
feat(api)!: require auth on media listing

BREAKING CHANGE: GET /api/media now returns 401 without a token.
```
