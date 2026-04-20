# Integrations

## Phase 1 — Launch
No external service integrations at launch. The system is fully self-contained.

## OpenRouter (AI Auto-Translation)

Integrated as of 2026-04-20 (switched from Anthropic SDK to OpenRouter on 2026-04-20). The API is used for background, fire-and-forget translation of content items and group titles into all enabled non-default languages whenever a create or update is performed via the admin API.

- **Service:** `packages/api/src/services/ai-translation.ts`
- **Model:** `anthropic/claude-haiku-4-5` via OpenRouter — chosen for low latency and cost efficiency
- **Trigger points:** `POST /api/admin/content`, `PATCH /api/admin/content/:id`, `POST /api/admin/groups`, `PATCH /api/admin/groups/:id`
- **Execution model:** `setImmediate` (fire-and-forget) — HTTP response is returned before translation runs; see ADR-010 for the decision rationale
- **Environment variable:** `OPEN_ROUTER_API_KEY` (optional; feature is silently disabled when absent)
- **Failure handling:** errors are logged to stderr; they do not affect admin operations or surface to the user

See [ADR-010](../decisions/ADR-010-ai-auto-translation-fire-and-forget.md) for the full decision record.

## Future Considerations
- **CloudFront CDN:** may be used in the future for image and static asset delivery. Not a constraint for Phase 1, but the image handling service should avoid hardcoding asset URLs in a way that would make a CDN migration painful.
- **Zapier / automation tools:** Phase 2 API key layer will enable third-party integrations.
- **MCP server:** Phase 2 integration point for AI agent content creation via chat.
- **Email (Resend):** [Planned — no release date] Transactional email will be handled by [Resend](https://resend.com) — an HTTPS-based API service with a free tier of 3 000 emails/month. Chosen over SMTP because the VPS hosting environment has port 25/587 restrictions that make SMTP unreliable. Implementation plan:
  - Install the `resend` npm package in `packages/api`.
  - One-time DNS setup: add SPF and DKIM records on the domain registrar for `info.bisericabetel.ro`.
  - Two new environment variables required (see `example.env`): `RESEND_API_KEY` and `EMAIL_FROM`.
  - Used for: (1) delivering temporary passwords on new admin account creation (FR-030), and (2) sending time-limited password reset links (FR-031).
