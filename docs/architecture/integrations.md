# Integrations

## Phase 1 — Launch
No external service integrations at launch. The system is fully self-contained.

## Future Considerations
- **CloudFront CDN:** may be used in the future for image and static asset delivery. Not a constraint for Phase 1, but the image handling service should avoid hardcoding asset URLs in a way that would make a CDN migration painful.
- **Zapier / automation tools:** Phase 2 API key layer will enable third-party integrations.
- **MCP server:** Phase 2 integration point for AI agent content creation via chat.
- **Email (Resend):** [Planned — no release date] Transactional email will be handled by [Resend](https://resend.com) — an HTTPS-based API service with a free tier of 3 000 emails/month. Chosen over SMTP because the VPS hosting environment has port 25/587 restrictions that make SMTP unreliable. Implementation plan:
  - Install the `resend` npm package in `packages/api`.
  - One-time DNS setup: add SPF and DKIM records on the domain registrar for `info.bisericabetel.ro`.
  - Two new environment variables required (see `example.env`): `RESEND_API_KEY` and `EMAIL_FROM`.
  - Used for: (1) delivering temporary passwords on new admin account creation (FR-030), and (2) sending time-limited password reset links (FR-031).
