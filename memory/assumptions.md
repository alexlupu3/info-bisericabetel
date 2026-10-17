# Assumptions

Purpose: record unvalidated product assumptions so they can be confirmed or removed later. Keep only assumptions that are still open; once one is confirmed or refuted, move the outcome into `docs/product/` or `docs/domain/` and delete it here.

## Assumptions
- Assumption: Most users will access the app primarily on mobile devices.
  Why it exists: initial entry points are QR codes and shared direct links
  Risk if false: desktop experience may be underdesigned
  Validation plan: confirm expected usage patterns and device mix

- Assumption: Users usually care most about information relevant to their own site.
  Why it exists: the church is multi-site and filtered views were identified as important
  Risk if false: site-first navigation could add unnecessary complexity
  Validation plan: confirm with real stakeholder and member usage expectations

- Assumption: The number of church sites will grow over time.
  Why it exists: stated explicitly by the product owner
  Risk if false: over-engineering the site management UI
  Validation plan: monitor site creation activity post-launch
