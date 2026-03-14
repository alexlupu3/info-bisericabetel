# Repository Guidelines

## Project Structure & Module Organization
This repository is both the application root and the project knowledge root. Keep the root clean and organize work predictably:

- `src/` for application code and feature modules
- `tests/` for automated tests mirroring `src/`
- `public/` or `assets/` for static files such as images, fonts, and icons
- `docs/` for longer design or deployment notes
- `memory/` for active decisions, assumptions, and unresolved questions

Use `docs/product/`, `docs/domain/`, `docs/architecture/`, and `docs/decisions/` for durable context. Example layout: `src/auth/login.ts`, `tests/auth/login.test.ts`, `docs/domain/glossary.md`.

## Build, Test, and Development Commands
No build system is configured yet in this directory. When adding tooling, expose the standard contributor workflow through documented commands such as:

- `npm install` to install dependencies
- `npm run dev` to start a local development server
- `npm test` to run the test suite
- `npm run lint` to check formatting and code quality

If a different stack is chosen, update this file in the same change that introduces the new commands.

## Coding Style & Naming Conventions
Use consistent, readable defaults until project-specific rules are added:

- Indentation: 2 spaces for JSON, YAML, Markdown, and JavaScript/TypeScript
- File names: `kebab-case` for folders and non-component files
- Classes and components: `PascalCase`
- Variables and functions: `camelCase`

Prefer small modules with one clear responsibility. Add a formatter/linter early and document it here once adopted.

## Testing Guidelines
There is no test framework configured yet. When adding one, place tests under `tests/` or next to source files if the toolchain expects that pattern. Name tests after the unit under test, for example `login.test.ts` or `login.spec.ts`.

New features should include happy-path coverage plus at least one failure or edge case.

## Commit & Pull Request Guidelines
Git history is not available in this directory, so use a simple conventional format for now: `type: short summary` such as `feat: add homepage layout` or `fix: handle empty state`.

Pull requests should include:

- a brief description of the change
- testing notes or commands run
- linked issue or task reference when relevant
- screenshots for UI changes

## Documentation & Memory Rules
Record important context in the repository, not only in chat.

- Put stable product, domain, and architecture knowledge under `docs/`
- Put major decisions in `docs/decisions/ADR-###-short-title.md`
- Put active assumptions, recent decisions, and open questions under `memory/`
- Update relevant documentation in the same change that updates behavior or requirements

## Configuration & Security
Do not commit secrets, `.env` files, or production credentials. Add local-only configuration files to `.gitignore` when they are introduced, and document required environment variables in `README.md`.
