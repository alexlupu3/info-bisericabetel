# ADR-026: Phone-only collapsed group preview with CSS geometry and a pin column

- **Status:** Accepted
- **Date:** 2026-11-04
- **Related:** ADR-022 (server-rendered snapshot and parity), ADR-013 (HTTP cache)
- **Implements:** FR-096 – FR-104

## Context
Long groups make the phone feed long: nine events stack into several screens before the next group. The public hub is also server-rendered (ADR-022): the snapshot must show the same items as the SPA, and crawlers must keep seeing every item. Editors want to choose which items lead a shortened group without changing the group's (often chronological) order.

## Options Considered
- **Capped list + "see all"** (first 3 in the grid, a counted row expands in place): cheapest and calmest, but plain; its mechanics are kept underneath the chosen option.
- **Fanned "hand of cards"** (3 tiles fanned like cards held in a hand, dealt into the grid on demand): the most distinctive and the most compact; tile content must be clipped. Chosen.
- **Horizontal snap carousel**: shortest section, but items past the second hide behind a swipe that desktop users rarely try and that conflicts with the iOS back-swipe.
- **Where to apply it**: everywhere vs. phones only. On desktop three items already fill one grid row, so collapsing saves little; phones only.
- **How to collapse**: remove items from the DOM on the client (layout shift on hydration, snapshot/SPA divergence) vs. keep every item and collapse with CSS (no shift, crawlers unchanged). CSS chosen.
- **Where to store pins**: a `data` JSONB key (would be translated and copied, survives group changes) vs. a column next to `group_id` and `order_position`. Column chosen.

## Decision
1. Collapse only below 640 px, only groups with 4+ visible items, to a hand of 3.
2. Keep every item in the DOM, in group order, in both renderers; the hand is pure CSS (`data-preview="hand"`, `data-slot` on 3 items, percentage transforms), so the first paint on phones is already collapsed and the HTML for crawlers is unchanged in content and order.
3. JavaScript adds only state, the back tiles' `aria-hidden` / `tabindex` toggling, the pointer-only expand overlay's click handler, focus and a FLIP animation (transform/opacity, disabled under reduced motion).
4. Store pins as `content_items.pinned_in_group` (boolean), cleared whenever the stored `group_id` changes; pins reorder only the hand.

## Implementation
`packages/shared/src/section-preview.ts` (`SECTION_PREVIEW_SIZE`, `isCollapsibleGroup`, `previewSlots`, plus `groupSlug` (the anchor id, moved out of `GroupBlock` so the snapshot prints the same id), `groupDomIds` (`group-<groupId>-title` / `-items`) `tileDate` (day and full month name for the date cover) and `tileTint` (the cover's site tint)), `GroupBlock.tsx` + `hooks/useSectionPreview.ts`, `index.css`, `render-snapshot.ts`, migration `0015_content_pinned_in_group.sql`, `PATCH /api/admin/content/:id` (`pinnedInGroup`), admin toggle `GroupPinToggle.tsx` rendered from the group rows of `ContentPage.tsx`.

## Consequences
- No layout shift on phones and no SEO change; snapshot parity keeps comparing DOM order.
- Tile content is clipped (descriptions hidden, posters cropped) until the group is opened.
- A new column and a reset rule on the three write paths that change `group_id` (PATCH, restore, group delete); a future path that changes `group_id` must reset it too.
- Follow-ups: MCP pinning, a per-group opt-out, expand analytics (spec 08 §11).
- Deviations from the original spec: (a) the snapshot sets `tabindex="-1"` only on the back tiles' links, not on the hidden items' content (those are `display: none` on phones, and `tabindex="-1"` on them would remove desktop keyboard stops before hydration); (b) collapsing animates the 3 hand tiles back, the other items disappear instantly instead of fading; (c) site labels are hidden inside tiles, like the description and CTA; (d) the "Doar primele 3…" hint is text from the `md` breakpoint and the toggle's title on smaller screens; (e) a site switch resets groups to the hand (`GroupBlock` is keyed by site and group).
