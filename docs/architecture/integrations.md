# Integrations

## Phase 1 — Launch
No external service integrations at launch. The system is fully self-contained.

## Future Considerations
- **CloudFront CDN:** may be used in the future for image and static asset delivery. Not a constraint for Phase 1, but the image handling service should avoid hardcoding asset URLs in a way that would make a CDN migration painful.
- **Zapier / automation tools:** Phase 2 API key layer will enable third-party integrations.
- **MCP server:** Phase 2 integration point for AI agent content creation via chat.
- **Email provider:** no email service chosen yet. Will be needed for admin password reset notifications when that flow is implemented.
