# ADR-001: Project Knowledge Structure

## Status
Accepted

## Context
The repository needs a durable way to store product context, domain knowledge, technical constraints, and implementation decisions so both humans and AI agents can reference the same source of truth.

## Options Considered
- Keep context mostly in chat and issue threads
- Store all context in one large document
- Split context by concern and track decisions separately

## Decision
The repository will use:
- `docs/product/` for product intent and requirements
- `docs/domain/` for business language and rules
- `docs/architecture/` for technical direction and constraints
- `docs/decisions/` for ADRs
- `memory/` for active assumptions, open questions, and recent decisions

## Consequences
- Team members have a predictable place to find information
- Important decisions become traceable over time
- Repository maintenance requires discipline to keep documents current
