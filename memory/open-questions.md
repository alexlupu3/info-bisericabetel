# Open Questions

Track unresolved questions that block product or technical decisions.

## Questions
- Question: What are the exact church sites that need to be represented in the product?
  Owner: repository owner
  Status: RESOLVED
  Answer: currently 4 sites; exact names/identifiers to be entered by admin, not hardcoded. System must support dynamic site creation.

- Question: Should QR codes and direct links open a generic home view, a site-specific view, or both depending on the link?
  Owner: repository owner
  Status: RESOLVED
  Answer: each site has its own QR code/direct link that opens a pre-filtered site view; users can switch to an all-sites view from there. URL design must support per-site deep links.

- Question: Who will maintain events, announcements, and bookmarked links?
  Owner: repository owner
  Status: RESOLVED
  Answer: multiple admin accounts, each with their own login. A super-admin manages admin accounts and sites. Regular admins can edit any content on any site. All changes are audit-logged.
