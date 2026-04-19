# User Flows

## Core Flows
List the highest-priority flows first.

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

### Flow 2 (Admin) — Managing groups on the Content page
- Trigger: an admin wants to create, populate, reorder, or delete a group
- Steps:
  - The admin opens the Content page in the admin tool
  - Groups are displayed as labeled container sections; ungrouped items appear in a "Fără grup" (ungrouped) section at the bottom
  - To create a group: admin clicks "+ Grup nou", enters a title, and the group appears immediately as an empty container
  - To assign an item to a group while editing: admin opens the item form and selects the target group from the group dropdown
  - To move an item between groups via drag and drop: admin drags the item from its current container and drops it onto the target container; the order and group assignment are persisted in a single interaction
  - To edit a group: admin clicks the group title directly (shortcut) or uses the "Editează" option in the group context menu; both open the same inline edit panel
  - To edit a content item: admin clicks the item name directly (shortcut) or uses the "Editează" option in the item context menu; both open the inline content form
  - To delete a group: admin clicks "Șterge grup" on the group header; all child items are soft-deleted (state → `deleted`, groupId cleared) and the group is hard-deleted. Items are recoverable from `/admin/archive`.
  - To collapse a group: admin clicks the chevron button (▶/▼) on the group header; the item list is hidden and the group cannot receive drops until re-expanded; the drag handle remains active so the collapsed group can still be reordered
  - To collapse or expand all groups at once: admin clicks "▲ Restrânge toate" / "▼ Extinde toate" in the page header (only visible when at least one group exists)
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

### Flow 3 — Switching between site-specific and all-sites views
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
