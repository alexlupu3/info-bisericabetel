// Section preview (swipeable card deck) on phones — spec 08, FR-096 / FR-097, BR-055 / BR-056.
// Shared by the public app (GroupBlock) and the server-rendered snapshot so both
// deal the same cards.

/** Cards visible in a collapsed group's deck: the top card and the one behind it (FR-096). */
export const SECTION_PREVIEW_SIZE = 2

/** A group collapses on phones when it has more visible items than this (BR-055). */
export const SECTION_PREVIEW_THRESHOLD = 3

/**
 * Whether a group collapses into the deck on phones: more than 3 visible items and the
 * group's own switch on (`enabled`, from `groups.section_preview`; default on).
 */
export function isCollapsibleGroup(visibleCount: number, enabled = true): boolean {
  return enabled && visibleCount > SECTION_PREVIEW_THRESHOLD
}

/**
 * The deck order (FR-097): indexes into the group's visible items, pinned items first in
 * group order, then unpinned items in group order. Swiping walks this order and wraps
 * around. A missing `pinnedInGroup` (responses cached before the column existed) reads
 * as `false`.
 */
export function deckOrder(items: ReadonlyArray<{ pinnedInGroup?: boolean | null }>): number[] {
  const pinned: number[] = []
  const unpinned: number[] = []
  items.forEach((item, index) => {
    ;(item.pinnedInGroup === true ? pinned : unpinned).push(index)
  })
  return [...pinned, ...unpinned]
}

/**
 * Indexes of the deck cards, top card first, after `swiped` swipes: the next
 * SECTION_PREVIEW_SIZE entries of deckOrder() from position `swiped` (wrapping).
 * `[]` when the group is not collapsible.
 */
export function previewSlots(
  items: ReadonlyArray<{ pinnedInGroup?: boolean | null }>,
  swiped = 0,
  enabled = true,
): number[] {
  if (!isCollapsibleGroup(items.length, enabled)) return []
  const order = deckOrder(items)
  const start = ((swiped % order.length) + order.length) % order.length
  return Array.from({ length: SECTION_PREVIEW_SIZE }, (_, k) => order[(start + k) % order.length])
}

/** Anchor id of a group section (`/centru#evenimente`): the title, lower-case, ASCII, dashed. */
export function groupSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** DOM ids of a group's heading and item list (aria-labelledby / aria-controls), same in both renderers. */
export function groupDomIds(groupId: string): { heading: string; list: string } {
  return { heading: `group-${groupId}-title`, list: `group-${groupId}-items` }
}
