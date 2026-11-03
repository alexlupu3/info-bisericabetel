# Spec 08 — Section preview ("hand of cards") on phones

| | |
|---|---|
| Status | Ready for implementation |
| Owner area | Public group rendering on phones; group-item pin flag |
| IDs | FR-096 – FR-104 (FR-095 of the reserved block is already taken by the admin theme requirement; numbering note in §7), BR-055 – BR-058 (BR-059 reserved, unused), ADR-026 (Proposed, full text in §12.6) |
| Migration (provisional) | `0016_content_pinned_in_group.sql` |
| i18n prefix | `section.` |
| Mockup | <https://claude.ai/artifact/QG2ffTctLFmGQpZ1Yak96T> (interactive: phone/desktop, light/dark, site accents, thumbnails on/off, simulated admin pins) |

## 1. Summary

On a phone, every item of a group is stacked in one column, so a group of nine events pushes the next group ("Fii parte din comunitate") several screens down. On phones only, a group with four or more visible items now collapses into a **hand of three cards**: three smaller tiles fanned on a shallow arc, the first one on top. A "Vezi toate · N" button (or a tap on a back card) deals the cards into today's grid with a short animation. A floating "Arată mai puțin" button gathers them back. Admins can **pin** items of a group so they lead the hand even when they sit lower in the group order. Every group heading shows its item count ("Evenimente · 9") on all screen sizes. Tablets and desktops keep today's full grid.

## 2. Goals / Non-goals

**Goals**
- Shorten the phone feed: a long group takes about one tile of height until the visitor asks for more.
- Keep the next three items readable without a tap, and the rest one tap away.
- Let admins choose which items lead the hand (pin), independent of the group's sort order.
- Show how many items a group holds, on every screen size.
- No change for tablets and desktops besides the count; no change to what crawlers, feeds and structured data see.
- Accessible: keyboard, screen readers, `prefers-reduced-motion`.

**Non-goals**
- Collapsing on tablet or desktop (the user ruled it out: "desktop doesn't benefit from this approach").
- Collapsing ungrouped items, or a cap on the number of groups.
- A per-group on/off switch or a per-group hand size (open question §11.3).
- Remembering the expanded state across visits or site switches.
- Pinning through MCP (open question §11.5) or pinning items that are not in a group.
- Analytics events for expand/collapse (open question §11.6).
- Changing the item page `/i/:itemId`, the RSS feed, `llms.txt`, JSON-LD or the sitemap.

## 3. Current state

- `packages/app/src/public/pages/HomePage.tsx` → `Feed()` collapses consecutive items with the same `groupId` into blocks and renders each group with `GroupBlock`.
- `packages/app/src/public/components/content/GroupBlock.tsx` renders `<section aria-label id=slug>`, a header (accent hairline + `<h2>` title) and a `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` grid of `ContentRenderer` items (`h3` headings inside).
- Item components: `CardItem.tsx` (16:9 thumbnail optional, date row, `EventLocation` row, title, Markdown description, CTA or external-link glyph), `PosterItem.tsx` (image at its own aspect ratio, 4:5 size hint), `RichtextItem.tsx`, `VideoItem.tsx`.
- Groups may contain only Cards and Posters; the admin drag-and-drop enforces it, the API does not (`docs/domain/content-model.md` → Groups). Group order is the admin's drag order or the chronological sort (BR-013).
- `GET /api/content` (`packages/api/src/services/public-content.ts`, `listPublicContent`) returns every `content_items` column (`getTableColumns`) plus `groupTitle`; the app filters expired items with `filterCurrent()` (`public/api/filter.ts`).
- The server-rendered snapshot (`packages/api/src/services/seo/render-snapshot.ts`, `renderFeed()` over `groupFeed()` from `page-model.ts`) prints the same groups, but with slightly different markup: `<section aria-label>` without the slug `id` or the accent hairline, and a `<div>` grid; `cypress/e2e/snapshot-parity.cy.ts` checks that both renderers show the same items in the same order (ADR-022).
- Admin: `packages/app/src/admin/pages/ContentPage.tsx` lists groups with their items (`SortableContentRow`, `ItemContextMenu`); `PATCH /api/admin/content/:id` (`routes/admin/content.ts`) updates an item and writes a `content.update` audit row.
- `group_id` changes only through `POST /api/admin/content` (creation), `PATCH /api/admin/content/:id` (the edit form sends `groupId` on every save; drag-and-drop between groups also uses PATCH, `ContentPage.tsx`), restore (`POST …/restore`, clears it) and group delete (`DELETE /api/admin/groups/:id`, clears it). The order endpoints (`PUT /api/admin/content/order`, `PUT /api/admin/content/root-order`) only set `order_position`; MCP `create_card` sets it at creation and `update_card` has no `groupId`; `services/group-order.ts` only reorders. Archiving keeps `group_id`.
- "Collapse" in this spec is the public phone preview; it is unrelated to the admin group collapse chevron on the Content page (`admin-group-collapse.cy.ts`).
- `content_items` has no pin or featured flag (`packages/api/src/db/schema.ts`). Highest migration: `0014_short_link_preview_mode.sql`; spec 01 holds `0015`.
- Cypress runs at its default 1000×660 viewport (no `viewportWidth` in the config), so existing specs see the desktop layout and are unaffected by a phone-only change.

## 4. User flows

**Visitor on a phone (screen narrower than 640 px)**
1. Opens `/centru`. The "Evenimente · 9" group shows three tiles fanned like cards in a hand: the first item on top, the next two peeking out to its right. Each tile shows the image (or a large date when the card has none), the date and the title. Below the hand: "Vezi toate · 9".
2. Taps the front tile → opens its link, exactly as today.
3. Taps a back tile or "Vezi toate · 9" → the tiles fly into the normal one-column list, the other six fade in, focus moves to the group's first item. "Arată mai puțin" floats at the bottom of the screen while the group is on screen.
4. Scrolls past the group → the floating button scrolls away with the end of the group. Scrolls back up and taps it → the cards gather back into the hand; if the heading had scrolled off the top, the page scrolls back to it; focus returns to "Vezi toate · 9".
5. A group with three items or fewer ("Fii parte din comunitate · 3") shows its items directly, with no button.

**Visitor on a tablet or desktop (640 px and wider)**: today's grid with every item; the heading shows "· N"; no buttons. Rotating a phone or resizing a window across 640 px switches between the two layouts; an expanded group stays expanded.

**Admin**
1. On the Content page, each item row inside a group has a pin toggle ("Fixează pe mobil"; pressed: "Fixat").
2. Pins "Tabăra de iarnă" (ninth in the chronological group order) → on phones it leads the hand; in the expanded list it stays ninth.
3. Pins four items → the first three pinned in group order lead the hand; the row of the fourth shows the hint "Doar primele 3 elemente fixate apar în față".
4. Moves a pinned item to another group, takes it out of the group, or deletes the group → the pin is cleared.

**Crawler / AI agent**: no change. The server-rendered HTML keeps every item in group order (collapsing is CSS on narrow screens); feeds, structured data and `llms.txt` ignore pins.

## 5. Requirements

- **FR-096** — On viewports narrower than 640 px (Tailwind `sm`), a group with **4 or more** visible items renders as a *hand*: the 3 items chosen by FR-097 as tiles, the other items hidden (`display: none`), and a "Vezi toate · N" button (`section.showAll`) below. A group with 3 or fewer visible items renders as today. Ungrouped items and viewports of 640 px and wider are never collapsed. "Visible" means after site filtering and `filterCurrent()`, i.e. the items the group renders today.
- **FR-097** — The hand shows, in this order: the group's pinned items in group order (at most 3), then its unpinned items in group order, up to 3 tiles. Pins never change the order of the expanded list, the desktop grid, the snapshot's DOM order, feeds or structured data (BR-056).
- **FR-098** — Hand tiles are 50 % of the content width with a 5:6 aspect ratio (height = 1.22 × width), fanned left to right with offsets of 0, ½ and 1 tile width, rotations of −5°, 0°, +5° around a point below the tile, the middle one raised 10 px; the first tile is on top. Inside a tile: Card → thumbnail (16:9), date row, location row, title clamped to 3 lines, no description, no CTA; Card without thumbnail → a typographic cover in place of the image (day in `betel-title-bold`, month in `betel-title-condensed` in the site accent, `aria-hidden`), or no cover when undated; Card with thumbnail and date → a corner date index (`aria-hidden`); Poster → the image fills the tile (`object-fit: cover`, top-anchored); Richtext/Video in a group (only reachable through the API) → title and text clipped with a bottom fade. The geometry is CSS only (no measuring), so the server-rendered HTML shows the hand before hydration.
- **FR-099** — Expanding (button or tap on a back tile) shows every item in group order in the normal one-column grid, animates each tile from its hand position to its place (FLIP, ~560 ms, staggered, transform and opacity only), moves focus to the group's first item and announces `section.expanded` in a polite live region. Under `prefers-reduced-motion: reduce` the switch is instant.
- **FR-100** — While a group is expanded on a phone, "Arată mai puțin" (`section.showLess`) is a pill button `position: sticky` at `bottom: calc(1rem + env(safe-area-inset-bottom))` inside the group's `<section>`, so it floats at the bottom of the screen while the group is on screen and rests below the last item otherwise. Collapsing animates back (same rules as FR-099), scrolls the group heading into view only if it is above the viewport, returns focus to "Vezi toate · N" and announces `section.collapsed`.
- **FR-101** — Every group heading, on every viewport and in the server-rendered snapshot, shows the number of visible items after the title as `· N` (muted, light weight, inside the heading element). The snapshot counts the server's visible items; after hydration the SPA's count (after `filterCurrent()`) wins, the same caveat ADR-022 accepts for items that expire between render and load.
- **FR-102** — Accessibility of the hand: buttons carry `aria-expanded` and `aria-controls` (the group's list); back tiles are `inert` while collapsed (one tab stop for the front tile, then the button); hidden items are out of the accessibility tree; tapping a back tile is a pointer shortcut only. The expanded/collapsed state lives in memory per group and resets on navigation, site switch or reload; crossing 640 px keeps it.
- **FR-103** — Content items have `pinned_in_group` (boolean, default `false`; migration `0016_content_pinned_in_group.sql`), returned as `pinnedInGroup` by `GET /api/content`, `GET /api/content/:id` and the admin content endpoints. `PATCH /api/admin/content/:id` accepts `pinnedInGroup: boolean` (rejects `pinnedInGroup must be a boolean`; rejects `true` on an item without a group, after the patch's own `groupId`, with `pinnedInGroup requires a group`; HTTP 400) and logs it in the `content.update` audit detail. Any write whose resulting `group_id` differs from the stored one resets the flag (BR-057); a save that resends the same `groupId` keeps it.
- **FR-104** — The admin Content page shows a pin toggle on each item row inside a group ("Fixează pe mobil" / pressed "Fixat", `aria-pressed`, title "Apare primul în previzualizarea grupului pe telefon"); toggling sends FR-103's PATCH and updates the row optimistically. When more than 3 items of a group are pinned, the rows of the pinned items after the third show "Doar primele 3 elemente fixate apar în față".

## 6. Design

### 6.1 Data model

Migration `packages/api/src/db/migrations/0016_content_pinned_in_group.sql` (renumber to the next free file if `0015`/`0016` are taken when this merges):

```sql
ALTER TABLE "content_items" ADD COLUMN IF NOT EXISTS "pinned_in_group" BOOLEAN NOT NULL DEFAULT false;
```

`schema.ts`: `pinnedInGroup: boolean('pinned_in_group').notNull().default(false),` in `contentItems`. No index (read with the whole row). A column, not a `data` key, because the pin is placement metadata like `order_position` and `group_id`: it is not translated, not per type, and must be cleared together with `group_id` (ADR-026).

### 6.2 Shared helper

`packages/shared/src/section-preview.ts` (exported from `@betel/shared`), used by the app and the snapshot so both pick the same tiles:

```ts
/** Tiles in a collapsed group (FR-096). */
export const SECTION_PREVIEW_SIZE = 3
/** A group collapses on phones when it has more visible items than the hand shows. */
export function isCollapsibleGroup(visibleCount: number): boolean
/** Indexes (into the group's visible items, group order) of the hand tiles, front first (FR-097). */
export function previewSlots(items: ReadonlyArray<{ pinnedInGroup?: boolean }>): number[]
```

`previewSlots` returns `[]` when the group is not collapsible. Unit tests in `section-preview.test.ts` (node:test, run by `pnpm test:unit`): no pins, one pin at the end, two pins, four pins (first three win), group of 3 and of 4, `pinnedInGroup` missing (old cached responses) treated as `false`.

### 6.3 API

- `GET /api/content`, `GET /api/content/:id`: no code change in `listPublicContent` (it selects every column); add `pinnedInGroup?: boolean` (optional: responses cached before the migration lack it, read as `false`) to `ContentItem` in `packages/app/src/public/api/client.ts` and to `FeedItem` in `services/seo/page-model.ts`.
- `PATCH /api/admin/content/:id`: new optional body field `pinnedInGroup`. Validation order: type (`pinnedInGroup must be a boolean`), then group (`pinnedInGroup requires a group` when the resulting `groupId` is null and the value is `true`). When the resulting `groupId` differs from `existing.groupId` (another group or `null`), the update sets `pinnedInGroup = false` unless the body pins it in the new group explicitly. The admin edit form sends `groupId` on every save, so the comparison is against the stored value, never "`groupId` is present in the body". Audit detail: `{ pinnedInGroup }` when present.
- The other writes that move items out of a group set `pinned_in_group = false` in the same statement: restore (`POST /admin/content/:id/restore`, already clears `group_id`) and group delete (`DELETE /admin/groups/:id`, already clears `group_id` of its items). No other path changes `group_id` (§3): the order endpoints, MCP and `services/group-order.ts` need no change. Archiving keeps the group and therefore the pin.
- Duplicate (`POST /admin/content/:id/duplicate`) copies `group_id` but not the pin (BR-058).
- MCP: unchanged. `create_card` with `groupId` creates unpinned items; `update_card` cannot pin (§11.5).
- Caching: unchanged (ADR-013); the field rides in the existing responses.

### 6.4 Public UI

**Component structure**
- `GroupBlock.tsx` gains the count, the hand markup and the buttons; the expand/collapse logic and the FLIP animation live in a new hook `packages/app/src/public/hooks/useSectionPreview.ts` (state, `matchMedia('(max-width: 639px)')`, `inert` on back tiles, focus, live-region text, reduced motion).
- Markup per collapsible group (also printed by the snapshot, §6.5):
  - `<section aria-labelledby=… id=slug data-preview="hand|open">`
  - `<h2>{title} <span class="…muted">· {N}</span></h2>`
  - `<ul data-preview-list>` with every item as `<li data-slot="0|1|2">` (hand tiles) or `<li>` (others), in group order. Today's grid is a `<div>`; it becomes a list so the button's `aria-controls` has a container and screen readers hear the count.
  - `<button class="sm:hidden" aria-expanded="false" aria-controls=…>Vezi toate · N</button>`
  - `<div class="sm:hidden sticky …" hidden><button aria-expanded="true">Arată mai puțin</button></div>` (shown only while open)
- The live region is one visually hidden `aria-live="polite"` element in `HomePage`, shared by all groups.

**CSS (in `packages/app/src/index.css`, scoped to `@media (max-width: 639px)` and `[data-preview="hand"]`)**
- The list becomes a one-cell grid: every `li[data-slot]` sits in `grid-area: 1 / 1`, `width: 50%`, `transform-origin: 50% 140%`; `li:not([data-slot])` is `display: none`; padding-bottom leaves room for the arc.
- Slots: `[data-slot="0"]` `translate(0, 20px) rotate(-5deg)`, z 3; `"1"` `translate(50%, 10px) rotate(0)`, z 2; `"2"` `translate(100%, 20px) rotate(5deg)`, z 1. Percentages of the tile's own width give FR-098's geometry with no JavaScript.
- Tiles: `aspect-ratio: 5 / 6`, `overflow: hidden`, a soft shadow (`0 6px 18px -10px` in a token colour); the per-type rules of FR-098 (`.line-clamp-3` title, hidden description/CTA/external glyph, poster `object-fit: cover; object-position: top`, richtext mask fade). Cover and corner index are rendered by `CardItem` only when a new `previewTile` prop is set and are `hidden` outside the hand.
- `prefers-reduced-motion: reduce` disables the hover lift and every transition in the hand.

**Animation (FLIP, in the hook)**: read each `li`'s box in the old state, switch `data-preview`, read the new boxes, apply the inverse transform (translate + the slot's rotation + scale by width ratio) with `transition: none`, force layout, then transition `transform` 560 ms `cubic-bezier(0.2, 0.7, 0.2, 1)` with a 30 ms stagger; items that were hidden start at slot 2 with `opacity: 0`. A `busy` flag ignores taps during the animation. Collapse mirrors it (20 ms reverse stagger). No layout properties are animated.

**i18n keys** (append to `packages/app/src/public/i18n/keys.ts`, Romanian defaults in `UI_DEFAULTS`, `packages/shared/src/i18n-defaults.ts`):

| Constant | Key | Romanian default |
|---|---|---|
| `SECTION_SHOW_ALL` | `section.showAll` | `Vezi toate · {count}` |
| `SECTION_SHOW_LESS` | `section.showLess` | `Arată mai puțin` |
| `SECTION_EXPANDED` | `section.expanded` | `{title}: se afișează toate cele {count}` |
| `SECTION_COLLAPSED` | `section.collapsed` | `{title}: se afișează {shown} din {count}` |

The heading count is a bare number and needs no key.

**Performance**: no new requests or dependencies; the hook attaches one `matchMedia` listener per page. The first image in the feed stays eager (LCP); in a hand it is the front tile's image when that is the first image in display order. Images of hidden items stay `loading="lazy"` and load when expanded.

### 6.5 Server-rendered snapshot (spec 03's renderer, delta owned here)

Both renderers change their group markup to §6.4: the snapshot moves from `<section aria-label>` + `<div>` grid to `<section aria-labelledby id=slug>` + `<ul>`/`<li>`, and adds the heading count, `data-preview="hand"`, `data-slot` from `previewSlots()` and the "Vezi toate · N" button with `UI_DEFAULTS['section.showAll']`; the SPA moves from `aria-label` to `aria-labelledby` (so the landmark name includes "· N") and from `<div>` to `<ul>`. The snapshot also prints `inert` on the slot 1 and 2 items and puts the hidden items' content out of the tab order, so it never offers more tab stops than the hydrated page; its button does nothing until the SPA hydrates and replaces the snapshot. Because the collapse is CSS, phones paint the hand from the first byte with no layout shift, and the HTML still contains every item in group order for crawlers. `snapshot-parity.cy.ts` keeps comparing items by DOM order (unchanged) and also compares the `data-slot` attributes.

### 6.6 Admin UI

`ContentPage.tsx`: the group-item `SortableContentRow` shows a small pin toggle before the context-menu trigger (pin glyph in `currentColor`; pressed state uses `--accent`); copy as FR-104. The admin API client (`packages/app/src/admin/api/`) adds `pinnedInGroup` to the item type and to `content.update`. Root-level rows have no toggle. On a 4th pin, no blocking: the hint explains that only the first three lead.

### 6.7 Configuration, security, privacy

No new environment variables. The pin is set only by authenticated admins through the existing admin route and audit log. Nothing about the visitor is stored or sent.

### 6.8 Considered alternatives

Compared in the first version of the mockup (same link, earlier version):
- **Top 3 + "see all" row** — the first 3 items in the grid, a full-width counted row to expand in place. Cheapest and calmest; kept as the mechanics underneath the hand (same trigger, same button, same expanded grid), not as its own presentation.
- **Horizontal snap carousel** — one swipeable row with a "see all" tile. Shortest section, but items past the second hide behind a gesture, poorly discovered on desktop and in conflict with the iOS back-swipe.
- **Hand on desktop too** — dropped after review: on desktop three items already fill one grid row, so collapsing saves little and hides content.
- **Hand of 5 with descriptions** — the first iteration fanned 1 + 4 full-width cards; the product owner asked for 3 smaller tiles fanned wider so more of each is visible.

## 7. Contracts

**Provides**
- `SECTION_PREVIEW_SIZE`, `isCollapsibleGroup()`, `previewSlots()` in `@betel/shared` (`packages/shared/src/section-preview.ts`).
- `pinnedInGroup` on public and admin content responses; `pinnedInGroup` on `PATCH /api/admin/content/:id`.
- The group heading count and the `data-preview` / `data-slot` markup, in both renderers.

**Consumes**
- `listPublicContent` (owner 2): unchanged; the new column passes through.
- The server-rendered snapshot and `groupFeed()` (owner 3): delta in §6.5; `FeedItem` gains `pinnedInGroup`.
- Public i18n keys file (shared, append-only): prefix `section.`.
- Domain rules for groups (`content-model.md` → Groups, BR-005, BR-008, BR-009, BR-013).

**Interactions with other specs**: spec 01 (PWA) — none; the sticky button respects `env(safe-area-inset-bottom)`, which 01 relies on for standalone mode. Spec 09 (admin sidebar, parallel) — admin layout only; this spec touches the group item rows in `ContentPage.tsx`, so whichever merges second rebases that file.

**Proposed rows for `docs/product/specs/README.md`** (coordinator applies):

Specs table:

```md
| 8 | [08-section-preview.md](08-section-preview.md) — phones: long groups collapse into a fanned "hand" of 3 cards with "see all"; group item counts; admin pins for the hand | Public group rendering (phone), group-item pin | FR-096 – FR-104 | ADR-026 | `0016_content_pinned_in_group.sql` |
```

Business-rules line: append `8 → BR-055–059 (BR-059 reserved, unused)`.

Numbering note: `FR-095 is taken by the admin light/dark theme requirement; spec 8 uses FR-096 – FR-104.`

Ownership table:

```md
| Group rendering on the public hub: heading count, collapsed "hand" on phones, `data-preview` / `data-slot` markup in both renderers, `previewSlots()` in `packages/shared/src/section-preview.ts` | 8 Section preview | 3 (snapshot prints the same markup) |
| `content_items.pinned_in_group` and its reset on group changes | 8 Section preview | 5 (MCP may expose it later) |
```

Ownership row edit: add `section.` for 8 to the i18n prefixes list.

Delivery order: `8 is independent; its migration renumbers to the next free file after 01's 0015.`

## 8. Rollout

- No flag: the phone layout ships to everyone; desktop sees only the count. Rollback = revert the app change; the column can stay (default `false`, unused).
- Deploy order: one container (API + app). The migration runs at API start before the app is served; older cached app builds ignore the new field, and the new app treats a missing field as `false`.
- Service worker: the new build is picked up by the existing `autoUpdate` flow (ADR-013); no new precache entries.
- Migration number: provisional `0016`; renumber if needed (`AGENTS.md` → Database migrations).

## 9. Testing

**Cypress — new `cypress/e2e/section-preview.cy.ts`** (stubs `GET /api/content` with `cy.intercept`; `cy.viewport(375, 812)` unless noted). Fixture: group "Evenimente" with 5 cards in group order (A–E; E pinned; B without thumbnail), group "Comunitate" with 3 cards, one ungrouped richtext.

*Happy flow*
1. Heading reads "Evenimente · 5"; the list has `data-preview="hand"`; exactly 3 items are visible, with `data-slot` 0, 1, 2 on E, A, B; C and D are not visible; the front tile (E) is focusable, A and B are `inert`; B shows the date cover.
2. "Vezi toate · 5" has `aria-expanded="false"`; clicking it shows all 5 in group order A–E, focuses A's link, shows "Arată mai puțin", sets `aria-expanded="true"` and the live region text.
3. Scroll so the end of the group is below the fold: "Arată mai puțin" is visible within the viewport (sticky). Click it: 3 tiles again, focus on "Vezi toate · 5".
4. Clicking a back tile (A) expands instead of following the link (the link stub is not hit).

*Regression scenarios*
5. "Comunitate · 3": no button, all 3 visible, no `data-preview`.
6. Ungrouped richtext: never collapsed, no count.
7. `cy.viewport(1000, 800)`: all 5 items visible in group order, heading "Evenimente · 5", no buttons visible.
8. Four pinned items (B, C, D, E): slots are B, C, D.
9. Resize from 375 to 1000 while collapsed → full grid; back to 375 → hand again.
10. Poster group: poster tile is cropped to the tile (computed `object-fit: cover`), full aspect when expanded.
11. Items without `pinnedInGroup` in the response (old API) render as unpinned.

**Cypress — `cypress/e2e/admin-groups.cy.ts` (or a new `admin-group-pin.cy.ts`)**: a group row's pin toggle sends `PATCH /api/admin/content/:id` with `{ pinnedInGroup: true }`, shows "Fixat" with `aria-pressed="true"`; root-level rows have no toggle; with four pinned items the fourth shows the "Doar primele 3…" hint; editing and saving a pinned item without changing its group sends the same `groupId` and the row stays "Fixat" (regression for the reset rule).

**Cypress — `snapshot-parity.cy.ts`**: add `pinnedInGroup` to the fixture and assert both renderers emit the same heading counts and the same `data-slot` values; `semantic-html.cy.ts`: the group heading still is an `<h2>` and items `<h3>`.

**Unit (`pnpm test:unit`)**: `packages/shared/src/section-preview.test.ts` (§6.2).

**Manual backend checks** (routes and SQL are not covered by the suite; report results in the PR):
- Migration applies on a copy of production data; existing rows read `pinned_in_group = false`.
- `PATCH` with `pinnedInGroup: true` on a grouped item → 200 and audit detail; on an ungrouped item → 400 `pinnedInGroup requires a group`; with `"yes"` → 400 `pinnedInGroup must be a boolean`; `{ groupId: null }` on a pinned item → pin cleared; `{ groupId: other }` → pin cleared; `{ groupId: <same group>, data: {…} }` (what the edit form sends) → pin kept.
- Restore and group delete clear the pin; reordering inside or across the root list keeps it; archiving keeps it; duplicate yields an unpinned copy.
- `GET /api/content` and `GET /api/content/:id` include `pinnedInGroup`.
- Real phones (iOS Safari, Android Chrome): sticky button above the home indicator, animation smooth, reduced-motion setting respected, VoiceOver/TalkBack read the button state.

## 10. Work breakdown

| # | Task | Files | Depends on |
|---|---|---|---|
| 1 | Shared helper + unit tests | `packages/shared/src/section-preview.ts`, `section-preview.test.ts`, `packages/shared/src/index.ts` | — |
| 2 | Column, API writes, types | `packages/api/src/db/migrations/0016_content_pinned_in_group.sql`, `db/schema.ts`, `routes/admin/content.ts` (PATCH, restore, duplicate), `routes/admin/groups.ts` (delete), `packages/app/src/public/api/client.ts`, `services/seo/page-model.ts` (`FeedItem`), admin API client types | — |
| 3 | Public hand: markup, CSS, hook, keys | `public/components/content/GroupBlock.tsx`, `CardItem.tsx`, `PosterItem.tsx`, `RichtextItem.tsx` (tile prop), `public/hooks/useSectionPreview.ts`, `public/pages/HomePage.tsx` (live region), `index.css`, `public/i18n/keys.ts`, `packages/shared/src/i18n-defaults.ts` | 1 (2 for the type; may stub `pinnedInGroup?: boolean`) |
| 4 | Snapshot markup | `packages/api/src/services/seo/render-snapshot.ts` | 1, 2 |
| 5 | Admin pin toggle | `packages/app/src/admin/pages/ContentPage.tsx`, `packages/app/src/admin/api/*` | 2 |
| 6 | Tests | `cypress/e2e/section-preview.cy.ts`, `admin-groups.cy.ts` or `admin-group-pin.cy.ts`, `snapshot-parity.cy.ts`, `cypress/support/helpers/public.ts` (`baseItem.pinnedInGroup = false`) | 3, 4, 5 |
| 7 | Doc integration (§12) and ADR-026 → Accepted | docs listed in §12 | 1–6 |

Tasks 1 and 2 can start in parallel; 3 is the largest (about 2 days including the animation); the rest are under a day each.

## 11. Open questions

| # | Question | Recommended default |
|---|---|---|
| 11.1 | Should pinned items also come first in the expanded list and on desktop? | **No.** The group order (often chronological) stays the truth; the pinned card visibly flies to its real place. |
| 11.2 | Should visitors see that an item is pinned? | **No marker.** Pins are an editorial choice, not information for the visitor. |
| 11.3 | Per-group switch to never collapse a group (e.g. a group meant to be read in full)? | **Not in v1.** Add a group-level flag later if editors ask; the rule is global. |
| 11.4 | Show the heading count on groups with 1–3 items too? | **Yes**, on every group, as the user asked; revisit if "· 1" looks odd in practice. |
| 11.5 | Pin through MCP (`update_card` `pinnedInGroup`)? | **Later**, as a small delta to the shared tool contract (FR-084) once editors use pins. |
| 11.6 | Track expand/collapse (`analytics_events`)? | **Not in v1.** Adding a type is cheap later (`POST /api/events` allowlist); decide once there is a question it would answer. |
| 11.7 | Should a URL hash pointing at a group (`/centru#evenimente`) open it expanded? | **No** in v1; the hand is already at the anchor. |
| 11.8 | Breakpoint: exactly Tailwind `sm` (640 px)? | **Yes**, so "phone" means the one-column layout, matching the existing grid. |

## 12. Doc integration

Applied with the code by the implementing developer unless marked "now". Ready to paste.

### 12.1 `docs/product/requirements.md`

Now (coordinator), under "Planned Features":

```md
#### Section preview on phones
Spec: [08-section-preview.md](specs/08-section-preview.md); ADR-026.
- FR-096: On viewports narrower than 640 px, a group with 4 or more visible items collapses into a "hand" of 3 tiles with a "Vezi toate · N" button; smaller groups, ungrouped items and wider viewports are never collapsed. **[Planned]**
- FR-097: Hand order: the group's pinned items in group order (max 3), then unpinned items in group order; pins never change any other order. **[Planned]**
- FR-098: CSS-only hand geometry (tiles 50 % wide, 5:6, fanned −5°/0°/+5°) with per-type tile content (card image or date cover, poster cropped, text clipped). **[Planned]**
- FR-099: Expanding shows every item in group order with a FLIP animation (instant under reduced motion), moves focus to the first item and announces it. **[Planned]**
- FR-100: A sticky "Arată mai puțin" button floats at the bottom of the screen while an expanded group is on screen; collapsing returns focus and scrolls the heading into view if needed. **[Planned]**
- FR-101: Every group heading shows its visible item count ("Evenimente · 9") on all viewports and in the server-rendered snapshot. **[Planned]**
- FR-102: Hand accessibility: `aria-expanded`/`aria-controls`, `inert` back tiles, in-memory state that survives breakpoint changes. **[Planned]**
- FR-103: `content_items.pinned_in_group` (migration `0016`), exposed as `pinnedInGroup`, settable via `PATCH /api/admin/content/:id`, cleared whenever the item's group changes. **[Planned]**
- FR-104: Admin pin toggle on group item rows ("Fixează pe mobil" / "Fixat") with a hint beyond the third pin. **[Planned]**
```

Also add FR-001 to the list of amended requirements in the "Planned Features" intro line.

On ship: move to "Public Hub" (FR-096 – FR-102, FR-104) and "Content Model" (FR-103) with `**[Implemented — <date>]**`; amend FR-001: "Content is displayed in the exact order defined by admins, at both root level and within groups (on phones, long groups start collapsed — FR-096)."

### 12.2 `docs/domain/business-rules.md`

```md
- BR-055: On phones (viewport narrower than 640 px) a group with more visible items than the preview size (3) starts collapsed into a hand of 3; groups of 3 or fewer, ungrouped items and wider viewports always show every item. Visibility (site scope, exclusive site, expiry) is applied first; the count shown in the group heading is the same visible count. Implementation: `packages/shared/src/section-preview.ts`.
- BR-056: The hand shows the group's pinned items first, in group order, at most 3, then unpinned items in group order. Pinning affects only the hand: the expanded list, desktop grid, server-rendered HTML order, feeds, structured data and admin order keep the group order (BR-013).
- BR-057: A pin belongs to an item's place in its group. Any change of `group_id` (moving to another group, removing from the group, restoring from the archive, deleting the group) clears it; saving an item without changing its group, reordering and archiving keep it. An item without a group cannot be pinned.
- BR-058: Duplicating an item never copies its pin (amends BR-009).
```

Changelog lines: `- BR-055 – BR-058 added: <date> (section preview, FR-096 – FR-104; BR-059 reserved, unused)`. Amend BR-009: append "The group pin (`pinned_in_group`) is not copied (BR-058)." and add the changelog line `- BR-009 updated: <date> (group pin not copied, BR-058)`.

### 12.3 `docs/domain/content-model.md` → Groups

Append:

```md
- On phones, a group with 4 or more visible items starts collapsed into a fanned "hand" of 3 items with a "see all" control; group headings show the visible item count (BR-055).
- An item inside a group can be **pinned** (`pinned_in_group`). Pinned items lead the collapsed hand (first 3 pinned, in group order) without changing the group order anywhere else; the pin is cleared when the item leaves or changes group and is not copied on duplicate (BR-056 – BR-058).
```

In "Publishing state", extend the Restore sentence: "Restoring a soft-deleted item clears its `groupId` (and its group pin, BR-057) since the original group may have been deleted."

And in "Shared Metadata": `- **Pinned in group:** boolean, default false; only meaningful while the item is in a group (BR-057).`

### 12.4 `docs/domain/entities.md`

Content item fields: add `pinned_in_group` (boolean, default `false`) — "leads the group's collapsed preview on phones; cleared when `group_id` changes".

### 12.5 `docs/product/user-flows.md`

Add `### Flow 19 — Browsing a long group on a phone` (§4 visitor steps 1–5) and `### Flow 20 (Admin) — Pinning an item to the front of a group's phone preview` (§4 admin steps 1–4), and one line in Flow 3 (which covers moving items between groups): "Moving a pinned item to another group or out of its group clears the pin (BR-057)."

### 12.6 `docs/decisions/ADR-026-phone-section-preview.md` (now: index row, status Proposed)

Index row:

```md
| [ADR-026](ADR-026-phone-section-preview.md) | Phone-only collapsed group preview: CSS geometry in both renderers, full DOM kept, pin as a column | Proposed |
```

ADR text (follow the template in `docs/decisions/README.md`):

```md
# ADR-026: Phone-only collapsed group preview with CSS geometry and a pin column

- **Status:** Proposed
- **Date:** <date>
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
3. JavaScript adds only state, `inert`, focus and a FLIP animation (transform/opacity, disabled under reduced motion).
4. Store pins as `content_items.pinned_in_group` (boolean), cleared whenever the stored `group_id` changes; pins reorder only the hand.

## Implementation
`packages/shared/src/section-preview.ts` (`previewSlots()`), `GroupBlock.tsx` + `useSectionPreview.ts`, `index.css`, `render-snapshot.ts`, migration `0016_content_pinned_in_group.sql`, `PATCH /api/admin/content/:id` (`pinnedInGroup`).

## Consequences
- No layout shift on phones and no SEO change; snapshot parity keeps comparing DOM order.
- Tile content is clipped (descriptions hidden, posters cropped) until the group is opened.
- A new column and a reset rule on the three write paths that change `group_id` (PATCH, restore, group delete); a future path that changes `group_id` must reset it too.
- Follow-ups: MCP pinning, a per-group opt-out, expand analytics (spec 08 §11).
```

### 12.7 `docs/product/roadmap.md` (now)

Under "Next feature batch":

```md
- **Section preview on phones** — long groups collapse into a fanned hand of 3 cards with "see all" and a floating "show less"; item counts in group headings; admin pins choose the cards in front. [08-section-preview.md](specs/08-section-preview.md), FR-096–FR-104, ADR-026.
```

### 12.8 Other docs

- `docs/architecture/configuration.md`, `security.md`: no change.
- `README.md` admin routes: no change (same Content page).
- `docs/architecture/overview.md`: if it describes public rendering, add one line: "Groups collapse on phones via CSS in both renderers (ADR-026)."
