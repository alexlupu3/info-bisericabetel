# Development
- always implement larger features (multiple commits) on feature branches
- break down larger features into smaller tasks and delegate to subagents
- 

# Repository Guidelines

## Coding Style & Naming Conventions
Use consistent, readable defaults until project-specific rules are added:

- Indentation: 2 spaces for JSON, YAML, Markdown, and JavaScript/TypeScript
- File names: `kebab-case` for folders and non-component files
- Classes and components: `PascalCase`
- Variables and functions: `camelCase`

Prefer small modules with one clear responsibility. Add a formatter/linter early and document it here once adopted.

## Testing Guidelines
Use Cypress testing framework for testing end-to-end functionality.
Write tests to cover happy flows for each feature to be able to run smoke tests.

When bugs are being fixed, add a test scenario for the bugged flow when possible to ensure the bug doesn't happen again.

Run all tests before commit, and if something breaks, fix it. Only commit when all tests pass!

## Commit
Favor atomic commits whenever possible.
Follow the conventional commit standard (there is a project-level skill available for this: conventional-commit)

## Documentation & Memory Rules
There is a project-level agent, the knowledge-base-steward that should always be used to:
- understand functional and non functional requirements
- maintain coherent specs and documentation for the project
- record important decisions and the evolution of the project

Always consult with the knowledge-base-steward to perform task analysis and make sure it doesn't break project coherence. After implementation, right before commit, have the knowledge-base-steward update the documentation with new relevant information / decisions / domain knowledge if the case.

Always make sure the README.md file is up to date.

## Configuration & Security
Do not commit secrets, `.env` files, or production credentials. Add local-only configuration files to `.gitignore` when they are introduced, and document required environment variables in `README.md`.
