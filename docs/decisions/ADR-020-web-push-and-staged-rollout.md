# ADR-020: Web Push for new events and staged PWA rollout

- **Status:** Proposed
- **Date:** 2026-10-28
- **Related:** ADR-010 (fire-and-forget background jobs), ADR-013 (cache strategy), ADR-014 (i18n), ADR-019 (custom service worker)
- **Implements:** FR-053 – FR-059

## Context

The hub has no way to reach members after they close the page. The owner wants push notifications for *new events*, strictly opt-in, on both iOS and Android, together with an install invite — and wants to go live quietly with a few testers before inviting everyone, once.

Constraints and forces:
- Single Fastify process, PostgreSQL only, no queue or worker infrastructure (ADR-006, ADR-010, ADR-016). Sunday-morning spikes matter (NFR-005); sending must never sit on the request path.
- Publishing happens through three code paths: `POST /api/admin/content/:id/publish`, `PATCH /api/admin/content/:id` with `state`, and the remote MCP `publish_card`, which writes directly to the database (ADR-015). Any trigger must cover all three.
- iOS Web Push works only for Home Screen web apps (iOS 16.4+), permission must come from a user gesture, and an installed iOS web app has storage separate from Safari. Safari 18.4+ also supports Declarative Web Push (`"web_push": 8030`).
- There is no settings table; feature switches have so far been environment variables, which an admin cannot flip from the UI.
- Subscriptions are personal data (capability URLs); the project has no user identity on the public side and should keep it that way.

## Options Considered

### Trigger and queue
- **A. Send synchronously inside the publish handler.** Simplest; but blocks the request for seconds with hundreds of subscriptions, cannot be cancelled if the admin un-publishes seconds later, and is lost on a crash. Rejected.
- **B. In-memory `setTimeout` (ADR-010 style).** Non-blocking and cancellable in-process, but a restart or deploy drops queued notifications and there is no record for the admin. Rejected.
- **C. DB-backed queue (`push_notifications` row per event) drained by an in-process poller (chosen).** Restart-safe, cancellable, auditable, and the unique index on `content_item_id` doubles as the dedupe lock. Costs one 30 s timer.
- **D. External queue / cron (Redis, pg-boss).** Over-engineering for < 10 notifications a week; rejected (ADR-006, ADR-016).

### Rollout switch
- **E. Environment variable.** Needs a redeploy or container restart per stage change; the owner cannot operate it. Rejected.
- **F. Generic `app_settings` key/value table with a super-admin page (chosen).** One row `pwa` holds stage, campaign and push settings; 60 s in-process cache; audit-logged writes. Reusable by later features.
- **G. Per-site rows / columns on `sites`.** Rollout is global, not per site. Rejected.

### Beta-tester mechanism
- **H. Server-side allowlist (tokens, emails).** Requires identity or token management; too heavy for a WhatsApp group of testers. Rejected.
- **I. Client-side flag set by an opt-in link `?pwa=beta` (chosen).** Zero backend state, shareable as a link or QR, revocable with `?pwa=off`. Not a security boundary — accepted, because being invited early is not sensitive. iOS caveat handled by treating standalone launches as eligible during `beta`.

### Payload format
- **J. Custom JSON read only by the service worker.** Works on Chromium/Firefox/Safari with a `push` handler.
- **K. Declarative Web Push envelope (`web_push: 8030` + `notification` object) that the service worker also understands (chosen).** Same payload, no branching per platform; Safari 18.4+ displays it even if the worker fails; older browsers use the `push` handler. Open tracking is done by the app through `?n=<notificationId>` on the click URL, so it works in both paths.

## Decision

1. **One notification per event, decided at publish time, sent later.** Publishing a Card with a non-empty title and `data.startDate` ≥ today (Europe/Bucharest, via `services/time.ts`) inserts a `push_notifications` row (`ON CONFLICT DO NOTHING` on the per-item unique index). A 30 s poller sends rows whose `send_after` has passed; `send_after` = publish time + debounce (default 10 min), pushed to the end of quiet hours (default 21:00–08:00). At send time the item is re-validated through `services/public-content.ts` (spec 02); if it is no longer visible or future-dated the row is cancelled. The three publish paths call the same `enqueueNewEventNotification()`; a failure there never fails the publish.
2. **Targeting mirrors public visibility.** A subscription records the site view (`site_slug`, null = all sites) and locale chosen when subscribing; recipients are selected with the same `exclusive_site` / `sites[]` rule as `GET /api/content`; text is localised with `content_translations`, `ui_translations` (`pwa.push.*` keys) and `formatEventWhen()` from `@betel/shared` (spec 04). Click target: the per-item page `/i/:itemId?n=<notificationId>` (spec 03), absolute via `absoluteUrl()` when `PUBLIC_BASE_URL` is set.
3. **VAPID keys are environment variables** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); when absent, push is off (no worker, `push.enabled=false` in `GET /api/pwa/config`, subscription endpoints return 400). Sending uses the `web-push` library in-process with concurrency 20, `TTL` 3 days, `urgency: normal`, `topic` per item.
4. **Subscriptions are anonymous and self-cleaning**: deleted on push-service 404/410, on in-app unsubscribe, when expired, after 5 failures older than 7 days, or after 180 days unseen (daily sweep). Endpoints never leave the server except to push services; the admin UI sees aggregates only.
5. **Rollout is a global setting** `pwa.stage ∈ {off, beta, all}` in `app_settings`, edited on `/admin/pwa` (super-admin, audit-logged). `off` hides every PWA/push UI and stops sending. `beta` makes browsers flagged by `?pwa=beta` (and standalone launches) eligible. `all` enables everyone. An `inviteCampaign` counter re-arms the one-time install invite; dismissals are stored per campaign in `localStorage`.
6. **Permission is requested only from a tap**, never automatically, and the UI explains the install-first requirement on iOS browser tabs.

## Implementation

- Migration `0013_pwa.sql` (provisional): `app_settings`, `push_subscriptions`, `push_notifications` (+ unique partial index on `content_item_id` for `kind = 'new_event'`).
- `packages/api/src/services/app-settings.ts`, `services/push.ts`, `routes/pwa.ts`, `routes/push.ts`, `routes/admin/pwa.ts`; hooks in `routes/admin/content.ts` (publish + PATCH) and `routes/mcp.ts` (`publish_card`); worker/sweep started from `index.ts` after migrations.
- `packages/app/src/public/pwa/*`, `components/pwa/*`, `src/sw.ts` handlers (ADR-019), `admin/pages/PwaPage.tsx`.
- Full design: `docs/product/specs/01-pwa.md`.

## Consequences

- Easier: the owner controls the rollout and can see what was sent; admins get notifications "for free" when publishing events (no new editorial step); AI agents publishing via MCP behave identically; a restart never loses a queued notification.
- Harder: a fourth table family to reason about in `permanent delete` (decision: `push_notifications` is an operational log and is not purged); the publish handlers gain a side effect that reviewers must keep in mind when adding new publish paths (rule: call `enqueueNewEventNotification()`).
- Accepted limitations: no per-user preferences beyond site + language; the beta flag is discoverable; iOS installs lose Safari preferences (platform behaviour); bursts of publishes produce one notification each until the optional batching task (spec 01, P12) lands.
- Follow-ups: manual "new content" notifications and per-event reminders (roadmap Phase 3) can reuse the queue, the targeting and the admin log; an MCP `notify: false` option if agents publish in bulk; key rotation procedure (all subscriptions become invalid — document before ever rotating).
