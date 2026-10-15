# Assumptions

Record assumptions explicitly so they can be validated or removed later.

## Assumptions
- Assumption: Most users will access the app primarily on mobile devices.
  Why it exists: initial entry points are QR codes and shared direct links
  Risk if false: desktop experience may be underdesigned
  Validation plan: confirm expected usage patterns and device mix

- Assumption: Users usually care most about information relevant to their own site.
  Why it exists: the church is multi-site and filtered views were identified as important
  Risk if false: site-first navigation could add unnecessary complexity
  Validation plan: confirm with real stakeholder and member usage expectations

- Assumption: Profile-based audience scoping (youth, family, elderly, leaders) will be added in Phase 2. **Status: deferred indefinitely.**
  Why it exists: the idea was explicitly planned, but the detailed Audiences plan showed substantial schema, permission, admin, analytics, and navigation complexity.
  Risk if false: audience field adds schema complexity with no short-term benefit; separate audience pages make users search in another destination and conflict with the single-hub goal.
  Validation plan: do not implement the standalone Audiences plan. Revisit only with a simpler solution integrated into the existing hub, without separate public pages.

- Assumption: The number of church sites will grow over time.
  Why it exists: stated explicitly by the product owner
  Risk if false: over-engineering the site management UI
  Validation plan: monitor site creation activity post-launch
