# Open Questions

Track unresolved questions that block product or technical decisions.

## Questions
- Question: If a future content type stores images under a JSONB field name other than `imageUrl` or `thumbnail`, the media usage detection query in `GET /admin/media` and `DELETE /admin/media/:id` must be updated. Is there a plan to centralize this or enforce a naming convention?
  Owner: repository owner
  Status: OPEN
  Context: Current usage detection scans `data->>'imageUrl'` (Poster) and `data->>'thumbnail'` (Card). Any new image-bearing content type that deviates from these names will appear as "not in use" even when actively referenced, making it deletable and causing broken images. See ADR-003.

- Question: Should the `/groups` route in the admin tool be removed or repurposed now that it is no longer linked in the navigation?
  Owner: repository owner
  Status: OPEN
  Context: The "Grupuri" nav link was removed as part of consolidating group management into the Content page (ADR-002). The route still exists in the router but is unreachable through normal navigation. Options: (a) remove the route entirely, (b) redirect it to /content, (c) repurpose it later for group-level analytics or bulk operations.


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

- Question (C-1): How is site-scope set for groups — only at creation, or can it be edited post-creation?
  Owner: repository owner
  Status: RESOLVED — 2026-03-17
  Answer: Both. Site-scope checkboxes are included in the "+ Grup nou" creation form. Groups also expose an "Editează" expand-panel on the header row in the Content page, pre-filled with current title and site assignments, allowing post-creation editing. Saving issues PATCH /admin/groups/:id.

- Question (C-2): Where does the list of available sites come from in the admin UI — hardcoded or fetched from the API?
  Owner: repository owner
  Status: RESOLVED — 2026-03-17
  Answer: Fetched from the API. GET /api/sites is called once when ContentPage mounts and cached via react-query (key: `['sites']`). The `SITES` hardcoded constant was removed. The `availableSites` array is threaded as a prop to CreateGroupForm, SortableGroupBlock (edit panel), and ContentForm.

- Question (C-3): When a group has a site scope, how does that interact with item-level site scopes within the group?
  Owner: repository owner
  Status: RESOLVED — 2026-03-17
  Answer: Group scope takes full precedence. If a group is scoped to specific sites, the entire group container (header + all items) is hidden for excluded sites, regardless of individual item site assignments. This is now documented as BR-005 in business-rules.md and in content-model.md under "Compound Site Scope".

- Question (C-4): Should the group header visually indicate which sites a group is scoped to?
  Owner: repository owner
  Status: RESOLVED — 2026-03-17
  Answer: Yes. Assigned sites are displayed as a text hint in the group header row whenever sites are set, giving admins immediate visibility of a group's scope without opening the edit panel.
