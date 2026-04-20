---
status: Accepted
date: 2026-04-20
---

# ADR-010: AI Auto-Translation via Fire-and-Forget Background Job

## Status
Accepted

## Context
The i18n strategy (ADR-009) established that content and group translations are stored in `content_translations` / `group_translations` and are served via a `?locale=` join on public API endpoints. Under that model, super-admins are responsible for providing translations through the admin UI.

In practice, manually entering translations for every new or updated content item and group is tedious and error-prone for a small admin team. The ask was to automate first-pass translation so that new content is immediately available in all enabled languages without admin effort, with the expectation that admins can still override any AI-generated translation through the existing translation UI.

Key constraints:
- Admin create/update HTTP endpoints must respond quickly — translation cannot block the request-response cycle.
- The feature must be safe to disable (i.e., the absence of `ANTHROPIC_API_KEY` must result in a clean no-op, not an error).
- AI-generated translations are best-effort; manual overrides must not be blocked or clobbered on subsequent saves unless the source content actually changed.
- Cost must be kept low; the service runs on a budget VPS.

## Options Considered

### Option A: Synchronous translation in the request handler
- Pros: simplest code path; translation is guaranteed to be ready by the time the HTTP response is returned.
- Cons: Claude API latency (200–800 ms typical) blocks every admin save; unacceptable for the admin editing experience.

### Option B: Fire-and-forget via `setImmediate`
- Pros: HTTP response returns immediately; implementation is a single service file with no new infrastructure; easy to reason about; failure is logged and isolated from the main request.
- Cons: no retry on failure; translation result is not visible in the same HTTP response; if the process crashes between request completion and `setImmediate` execution the translation is silently lost.

### Option C: Persistent job queue (e.g., pg-boss, BullMQ)
- Pros: durable; retryable; observable.
- Cons: adds infrastructure complexity (Redis or a new DB schema); overkill for a low-write-rate admin tool; admin writes happen at most a few times per day.

## Decision
**Option B** (fire-and-forget via `setImmediate`) was chosen.

The write rate for this application is very low — admins create or update content items at most a handful of times per day. The cost of a lost translation is low (the admin can trigger a retranslation by saving again, or fill in manually). The cost of adding a persistent queue is disproportionately high.

Implementation is in `packages/api/src/services/ai-translation.ts`:
- `scheduleContentTranslation(contentItemId, data)` — called after `POST /api/admin/content` and `PATCH /api/admin/content/:id` when `data` is present.
- `scheduleGroupTranslation(groupId, title)` — called after `POST /api/admin/groups` and `PATCH /api/admin/groups/:id` when `title` is in the update.
- Both functions use `setImmediate` to defer execution past the current event loop tick (after the HTTP response has been sent).
- The OpenRouter API key is read from `process.env.OPEN_ROUTER_API_KEY`; if the key is absent the function logs a warning and returns immediately.
- `anthropic/claude-haiku-4-5` via OpenRouter is used for its speed and low cost. Translation is performed via a standard OpenAI-compatible `/chat/completions` call using native `fetch`.
- Translations are upserted — a subsequent save with changed content will overwrite the previous AI translation for that locale.

## Consequences
- Admin HTTP response times are unaffected by translation latency.
- All enabled non-default languages receive a translation automatically when content or groups are created or updated.
- If `OPEN_ROUTER_API_KEY` is not set (e.g., in development or a cost-constrained deployment), the feature is silently disabled — no error, no changed behavior for existing functionality.
- AI translations can be overridden at any time via the existing translation admin UI. A subsequent admin save of the same content item will re-run auto-translation and overwrite only AI-generated rows (because the upsert targets `(contentItemId, locale)` / `(groupId, locale)` — there is no separate "source" flag; manual and AI translations live in the same rows).
- Failures (Claude API errors, parse errors) are logged to stderr but do not surface to the admin user. Monitoring server logs is the only observability mechanism at this time.
- If more languages are added later, all existing content will not be retroactively translated — only new creates/updates trigger auto-translation.
