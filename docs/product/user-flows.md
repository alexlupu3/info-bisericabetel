# User Flows

## Core Flows
Member-facing flows come first, followed by admin flows.

### Flow 1 — Member accesses content via QR code or direct link
- Trigger: a church member scans a QR code or opens a direct link
- Steps:
  - the app opens on mobile, pre-filtered to the site encoded in the link
  - the member sees a single scrollable page of content in the admin-defined order
  - groups are displayed with their title and their items visible beneath them
  - the member finds the information they need inline — no tab switching or sub-navigation required
- Success state: the member finds relevant information without additional help
- Failure or edge states:
  - the QR code leads to outdated or incomplete information
  - the member cannot tell which site the content belongs to

### Flow 2 — Switching between site-specific and all-sites views
- Trigger: a member wants to switch between site-specific and all-sites views
- Steps:
  - a subtle inline link is always available on the page
  - if currently on an all-sites view: link reads "view site..." — tapping opens a popup listing all available sites to choose from
  - if currently on a site-specific view: link reads "view all" — tapping switches directly to the all-sites view
  - the selected view updates the displayed content accordingly
- Success state: the member can move between local-site and church-wide content without the switcher dominating the UI
- Failure or edge states:
  - the switcher is so subtle the member cannot find it
  - the site list in the popup is empty or outdated

### Flow 3 (Admin) — Managing groups on the Content page
- Trigger: an admin wants to create, populate, reorder, or delete a group
- Steps:
  - The admin opens the Content page in the admin tool
  - Groups are displayed as labeled container sections; ungrouped items appear in a "Fără grup" (ungrouped) section at the bottom
  - To create a group: admin clicks "+ Grup nou", enters a title, optionally ticks site-scope checkboxes (none = all sites), and the group appears immediately as an empty container
  - To assign an item to a group while editing: admin opens the item form and selects the target group from the group dropdown
  - To move an item between groups via drag and drop: admin drags the item from its current container and drops it onto the target container; the order and group assignment are persisted in a single interaction
  - To edit a group: admin clicks the group title directly (shortcut) or uses the "Editează" option in the group context menu; both open the same inline edit panel
  - To edit a content item: admin clicks the item name directly (shortcut) or uses the "Editează" option in the item context menu; both open the inline content form
  - To delete a group: admin clicks "Șterge grup" on the group header; all child items are soft-deleted (state → `deleted`, groupId cleared) and the group is hard-deleted. Items are recoverable from `/admin/archive`.
  - To collapse a group: admin clicks the chevron button (▶/▼) on the group header; the item list is hidden and the group cannot receive drops until re-expanded; the drag handle remains active so the collapsed group can still be reordered
  - To collapse or expand all groups at once: admin clicks "▲ Restrânge toate" / "▼ Extinde toate" in the page header (only visible when at least one group exists)
  - To sort a group chronologically: admin clicks the "Sortează cronologic" button (ArrowUpDown icon) on the group header; all items in the group are immediately reordered by start date ascending (undated items move to the end); the order is persisted via the reorder API; if all items are undated the action is a silent no-op
  - When adding a new content item inside a group (via the "+ adaugă conținut în grup" inline form): after the item is saved, the group is automatically re-sorted chronologically — the new item is inserted in start-date order among existing items; if the new item has no start date it is appended last
- Success state: groups are created, populated, reordered, and collapsed without leaving the Content page; no separate Groups page navigation required
- Failure or edge states:
  - A group is deleted while it still has items (handled: items are soft-deleted and moved to `/admin/archive`; recoverable via restore)
  - A drag operation is cancelled mid-way (handled: item returns to its original position)

### Flow 4 (Super-Admin) — Resetting an admin user's password

- Trigger: a super-admin needs to restore access for an admin whose password is unknown or compromised
- Steps:
  - The super-admin opens the Users page in the admin tool
  - Each `admin`-role user row displays a "Resetează parola" button (super-admin accounts have no such button)
  - The super-admin clicks the button — a `window.confirm` prompt asks for confirmation
  - On confirmation the API generates a temporary password, sets `must_change_password = true`, and returns the plaintext once
  - The admin UI displays the temporary password in a panel (same pattern as new user creation)
  - The super-admin copies the temporary password and communicates it to the affected admin via an out-of-band channel (e.g. direct message)
  - On the affected admin's next login they are immediately prompted to set a new permanent password
- Success state: the affected admin regains access with a new password they chose themselves; the temporary credential is no longer valid after the forced change
- Failure or edge states:
  - Target user not found — API returns 404
  - Target user is a super-admin — API returns 400; button is not shown in the UI for super-admin rows
  - The super-admin closes the panel before copying the password — the temporary password cannot be retrieved again; the flow must be repeated

### Flow 5 (Admin) — Reviewing and acting on soft-deleted content items

- Trigger: an admin wants to review deleted content items, restore one, or permanently remove it
- Steps:
  - The admin navigates to `/admin/archive`
  - The Archive page lists all content items with state `deleted`
  - For each item, the admin can choose:
    - "Restaurează" — restores the item to `draft` state; its `groupId` is cleared (the original group may have been deleted); the item reappears in the admin Content page as an ungrouped draft
    - "Șterge definitiv" — permanently hard-deletes the item from the database with no further recovery possible
  - Items arrive in the archive either from a direct "Șterge" action on an individual content item, or as a cascade when their containing group was deleted
- Success state: the admin has either recovered valuable content or confirmed it should be permanently removed
- Failure or edge states:
  - Admin restores an item whose group no longer exists (handled: groupId is cleared; item appears in ungrouped section)
  - Admin permanently deletes an item that was referenced by analytics events (handled: `item_id` on analytics events is a soft reference with no FK constraint — events are preserved)

### Flow 6 (Admin) — Duplicating a content item

- Trigger: an admin wants to create a new item that is similar to an existing one (e.g. recurring event, same-format announcement)
- Steps:
  - The admin opens the Content page
  - The admin opens the context menu (⋮) on the item they want to duplicate
  - The admin clicks "Duplică"
  - A new `draft` item is created immediately with the same type, fields, site scope, group assignment, and expiry as the original — except media attachments (`thumbnail` for cards, `imageUrl` for posters) are not copied
  - A toast notification confirms "Element duplicat"
  - The duplicate appears in the content list (at the bottom of the global order, within the same group if applicable)
  - The admin opens the duplicate to fill in the missing image (if applicable) and make any other adjustments before publishing
- Success state: the duplicate is created in draft state, is editable, and does not appear on the public hub until the admin publishes it
- Failure or edge states:
  - Original item not found (deleted between page load and click) — API returns 404; the admin sees an error toast
  - The duplicate inherits `expiresAt` from the original — if the original was near expiry, the duplicate may also be near expiry; the admin should review the dates after duplication

### Flow 7 (Admin) — Analyzing a specific historical date range in the analytics dashboard

- Trigger: an admin wants to investigate activity starting from a specific past date (e.g. the day a campaign started or an event was announced) rather than using a rolling preset window
- Steps:
  - The admin opens `/admin/analytics`
  - The admin locates the "De la" date picker in the page header controls area (to the right of the Zi / Săptămână / Lună preset buttons)
  - The admin selects a start date; the picker prevents selecting a future date
  - The preset buttons become inactive (none highlighted); the charts reload showing daily data from the selected date to today as the current period
  - The previous-period comparison line automatically uses the same number of days immediately before the selected start date
  - To clear the custom range: the admin clicks the "×" button next to the date input; the dashboard reverts to the previously active preset (or defaults to week)
  - Alternatively, clicking any preset button (Zi / Săptămână / Lună) also clears the custom date and activates that preset
- Success state: the admin sees daily trend data anchored to their chosen start date, with an automatic same-duration comparison window for context
- Failure or edge states:
  - Admin selects a very distant start date — large windows fetch more data but the chart renders the same dual-line format; no practical limit is enforced beyond what the database holds
  - Admin selects today as the start date — current period is a single day, previous period is the single day before it

### Flow 8 (Super-Admin) — Running a SQL query in the SQL console

- Trigger: a super-admin needs to inspect or correct data that no admin page exposes
- Steps:
  - The super-admin opens `/admin/sql` ("SQL" nav link)
  - The super-admin types one statement; the "Doar citire" (read-only) checkbox is ticked by default and is cleared only when the statement must write
  - The super-admin clicks run; a warning modal opens
  - The super-admin presses the confirm button twice within 5 seconds; after 5 seconds the first press expires and must be repeated. Escape or Cancel closes the modal without running anything
  - The result appears as a table of at most 500 rows, with a "500+" notice when it was truncated
- Success state: the query ran in its own transaction and an `sql_query` entry exists in the audit log (`/admin/logs`)
- Failure or edge states:
  - Validation or filter rejection (`invalid`, `blocked`) — HTTP 400 with the reason; nothing reaches the database; a blocked query is logged as `sql_query_blocked`
  - PostgreSQL error (`database`) — message with line, column and hint where available
  - A write in read-only mode (`read_only`) — rejected; clear the checkbox to allow it
  - Query longer than 10 seconds (`timeout`) — cancelled
  - The console role is not installed (`unavailable`, HTTP 503) — a superuser must run migration `0012_sql_console_role.sql`
  - The audit entry cannot be written — HTTP 500 and the query is not run

### Flow 9 (Admin) — Setting the start time of a single-day event

- Trigger: an admin publishes a card for an event that happens at a specific hour on one day
- Steps:
  - The admin opens the content form and sets "Dată"
  - "Până la" and "Ora de început (opțional)" appear
  - The admin enters the hour (24-hour, Romania time) and saves
  - The public card shows the date followed by the time in the visitor's language ("14 noiembrie · 18:00")
- Success state: the time is stored on the item, shared across languages, and used for chronological ordering inside groups
- Failure or edge states:
  - The admin later sets "Până la" to a different day — the time input disappears, the time is cleared on save and a hint explains that times apply to single-day events only
  - The admin clears "Dată" — end date and time are cleared together
  - The event's hour passes — the card stays visible until the end of the day in Romania (BR-015)

### Flow 10 — Crawler or AI agent reads the hub
- Trigger: a search engine, link unfurler or AI crawler fetches a public URL
- Steps:
  - `GET /robots.txt` allows public paths and points to `/sitemap.xml`
  - `GET /sitemap.xml` lists the home page, every site page and every visible item page
  - `GET /`, `/:siteSlug`, `/i/:itemId` return HTML with title, description, canonical, Open Graph and JSON-LD (`WebSite`, `Organization`, `Church`, `Event`, `ItemList`) plus a readable HTML snapshot of the feed — no JavaScript needed
  - admin, API, short-link and MCP paths are excluded (`robots.txt`, `X-Robots-Tag`)
- Success state: the page is indexed with the correct title/description; dated events with a single site are eligible for event rich results
- Failure or edge states: unknown slug/item → 404 with `noindex`; expired or unpublished item page → 404 with `noindex` (deleted → 410); the snapshot and the SPA drift (guarded by the parity test)

### Flow 11 — Visitor opens an item page
- Trigger: a visitor follows a link to `/i/:itemId` (search result, feed reader, shared link)
- Steps:
  - The page shows the item in its site context (the item's exclusive site, or its single site) with the site's name and address in the footer
  - "Înapoi la toate informațiile" goes to that site's hub (or `/` when the item belongs to all sites)
- Success state: the visitor sees the item and can continue to the full hub
- Failure or edge states: the item has expired, was unpublished or deleted → "Această informație nu mai este disponibilă." with a link back to `/`


### Flow 12 — AI agent builds an event digest
- Trigger: an agent with a web-fetch tool is asked what is happening at Biserica Betel in the coming days
- Steps:
  - The agent fetches `/llms.txt` (or reads `<link rel="alternate" type="application/rss+xml">` on a hub page, or the comment in `robots.txt`) and learns the feed URLs: `/feed.xml` for all sites and `/<siteSlug>/feed.xml` per site
  - It fetches a feed, optionally with `?lang=<code>`
  - It reads the items in document order (chronological), using `ev:startdate` / `betel:startDate` / `betel:startTime` for dates, `ev:location` for the place, `<link>` (the item page `/i/<id>`) to send a person to the item and `betel:actionLink` for the registration or detail page
  - A later fetch with `If-None-Match` gets `304` while nothing changed
- Success state: a correct digest with dates, places and links, without knowing `GET /api/content`
- Failure or edge states: unknown site slug → 404; unknown or disabled language → 400; a missing translation → Romanian text (ADR-014); site-exclusive events appear only in their site's feed (BR-006), which `/llms.txt` lists

### Flow 13 — Member subscribes in a feed reader
- Trigger: a member pastes `https://<host>/<siteSlug>` (or `/`) into a feed reader
- Steps:
  - The reader auto-discovers `/<siteSlug>/feed.xml` (or `/feed.xml`) from the page head
  - It lists the current and upcoming events; opening an entry goes to the item page `/i/<id>` (Flow 11)
  - The reader polls at its own cadence; unchanged feeds answer `304`
- Success state: new events show up in the reader within about five minutes of publishing
- Failure or edge states: the event expired between the poll and the click → the item page's not-found state (404, `noindex`); a reader that sorts by `pubDate` shows newest-created first instead of chronological order

### Flow 14 (AI agent) — Reporting on an event's performance through MCP
- Trigger: an editor asks the agent (Claude Desktop, Cursor, Claude iOS) how an announcement performed
- Steps: the agent finds the item id (`list_cards` / `get_top_items`), calls `get_item_stats` for the wanted range, optionally `get_short_link_stats` per channel, and summarises totals, trend vs the previous period and the best channel
- Success state: numbers match the admin dashboard's totals for the same days in the same time zone (`tz`, default Europe/Bucharest)
- Edge states: unknown or deleted item → tool error; no events in the previous period → `previous.*ChangePct = null` for that metric; no events in range → zeros

### Flow 15 (AI agent) — Creating a short link through MCP
- Trigger: an editor asks for a trackable link for a channel (WhatsApp group, flyer QR)
- Steps: `create_short_link(itemId, label, siteSlug?)`; the agent returns the `url`; the link appears in the content editor's "Link-uri scurte" tab and in `/admin/logs` as `short-link.create`
- Edge states: item without a link → `warning`, the link redirects to `/` until a link is set; unknown site → error
