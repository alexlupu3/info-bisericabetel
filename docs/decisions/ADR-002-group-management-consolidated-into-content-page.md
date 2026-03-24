# ADR-002: Group Management Consolidated into the Content Page

## Status
Accepted

## Context
The admin tool initially provided a separate "Grupuri" (Groups) navigation link and dedicated `/groups` route for creating and managing groups. This required admins to navigate away from the content list to perform group operations, then return to manage content ordering. Groups are closely related to content items — they serve purely as display containers — so this separation created unnecessary context switching.

The Content page already handled drag-and-drop reordering of items. Adding group management inline avoids a second place where admins must go to do related work and makes the relationship between groups and their contents immediately visible.

## Options Considered

### Option A: Keep a separate Groups page
- Groups have their own nav entry and route (`/groups`)
- Admins navigate to Groups to create/delete groups, then navigate back to Content to move items into them
- Pro: clear separation of concerns in the nav
- Con: context switching; group creation and content assignment feel disconnected; the groups page only needs to do very little (create a group with a title, delete it) which does not justify a dedicated page

### Option B: Consolidate group management into the Content page (chosen)
- Groups appear as visual container sections directly on the Content page
- "+ Grup nou" button creates a group inline (title only required)
- "Șterge grup" button on each group header deletes that group (items auto-migrate to ungrouped)
- Multi-container drag and drop allows moving items between groups without any extra navigation
- The content create/edit form retains a group dropdown as a convenience field
- The `/groups` route still exists but is no longer linked in the navigation

## Decision
Group management is fully integrated into the Content page. The "Grupuri" nav link has been removed. The `/groups` route remains in the router but is not reachable through the UI navigation.

## Consequences
- Admins never need to leave the Content page to create, delete, or populate groups — all group lifecycle actions are inline.
- The content page now owns multi-container drag-and-drop: items can move within a group (reorder), from one group to another, or between the ungrouped section and any group.
- Persistence is split by scope: root-level structure is saved through `api.content.reorderRoot`, while per-group item order is saved through `api.content.reorder`. When an item crosses container boundaries, `api.content.update` also patches its `groupId`, and source/target groups may each receive a per-group reorder call if they still contain items.
- When a group is deleted, its items are moved to ungrouped (groupId set to null) before the group record is removed, preventing orphaned items.
- A `DragOverlay` renders a visual ghost of the dragged item during the operation for a clear affordance.
- Local state (`ContainerData[]`) tracks items per container and is synced from the server on load. `containersRef` (useRef) mirrors this state to avoid stale closure issues in drag event handlers. `dragOriginRef` tracks which container a drag started in so cross-container moves can be detected correctly when `onDragOver` already performs an optimistic update.
- The `/groups` route is a documented dead end. It should either be removed in a future cleanup or repurposed. See open questions.
- **Post-creation group editing** is implemented via an expand-panel interaction on the group header row. An "Editează" button expands a panel directly below the header (above the items list) with a title input and site-scope checkboxes, both pre-filled with current values. Save issues PATCH /admin/groups/:id. Cancel collapses the panel without changes. The group header also displays assigned sites as a text hint when sites are set, giving admins immediate visibility of a group's scope without opening the edit panel.
- **Group creation includes site-scope selection.** The "+ Grup nou" form contains site-scope checkboxes in addition to the title field. Sites default to empty (= all sites / no restriction). Available sites are loaded from GET /api/sites (not hardcoded) and cached via react-query.
- **Per-group collapse/expand toggle.** Each group header row now has a chevron button (▶ collapsed / ▼ expanded) placed between the drag handle and the group title. Clicking it hides or shows that group's item list. When collapsed: the item list is not rendered; the group's droppable area is disabled (items cannot be dragged into a collapsed group); the drag handle remains fully functional so collapsed groups can still be reordered. Collapsed state is local, non-persistent — it resets to expanded on page reload.
- **Toggle-all-groups button.** The Content page header shows a "▲ Restrânge toate" / "▼ Extinde toate" button whenever at least one group exists. If not all groups are collapsed it collapses all; if all are already collapsed it expands all.
- **State management for collapse.** `collapsedGroups: Set<string>` is held in `ContentPage` local state. No server round-trip or persistence is involved.
- **Test coverage.** `cypress/e2e/admin-group-collapse.cy.ts` covers: toggle presence on all groups; expanded-by-default; collapse hides items / expand restores; other groups unaffected by a single collapse; drag handle visible while collapsed; toggle-all collapses/expands all; mixed-state toggle-all collapses all; collapsed groups cannot receive drops (no `content/order` API call when dragging over a collapsed group).
- **Test IDs.** `collapse-toggle-{groupId}` per group; `toggle-all-groups-btn` for the page-level button.

## Update History
- 2026-03-16: ADR written; group creation (title only), deletion, and multi-container drag-and-drop implemented.
- 2026-03-17: Added expand-panel group editing, site-scope checkboxes in creation form, and API-driven site list.
- 2026-03-18: Added per-group collapse/expand toggle and a "toggle all groups" button in the page header (see Consequences below).

## Date
2026-03-16
