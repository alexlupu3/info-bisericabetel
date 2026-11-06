// Section preview (swipeable deck of two tiles) on phones — spec 08, FR-096 / FR-097,
// BR-055 / BR-056. Shared by the public app (GroupBlock) and the server-rendered snapshot so
// both deal the same tiles.

/** Tiles visible in a collapsed group's deck: the top tile and the one behind it (FR-096). */
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
 * group order, then unpinned items in group order. Swiping walks this order and stops at
 * its last item. A missing `pinnedInGroup` (responses cached before the column existed) reads
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
 * SECTION_PREVIEW_SIZE entries of deckOrder() from position `swiped`. The deck does not wrap
 * around: on the last item there is no card behind it (one entry). `swiped` is clamped to
 * 0 … count - 1. `[]` when the group is not collapsible.
 */
export function previewSlots(
  items: ReadonlyArray<{ pinnedInGroup?: boolean | null }>,
  swiped = 0,
  enabled = true,
): number[] {
  if (!isCollapsibleGroup(items.length, enabled)) return []
  const order = deckOrder(items)
  const start = clampSwiped(swiped, order.length)
  return order.slice(start, start + SECTION_PREVIEW_SIZE)
}

/** The furthest a deck can be swiped: until the last item is the top card. */
export function clampSwiped(swiped: number, count: number): number {
  return Math.max(0, Math.min(Math.trunc(swiped) || 0, count - 1))
}

/** Tiles under each pile whose edge peeks out (the real next cards, not drawn sheets). */
export const SECTION_PREVIEW_DEPTH = 2

/**
 * The tiles lying under the deck's two piles after `swiped` swipes, nearest the pile's top
 * tile first: `pile` under the top tile (the ones swiped past, most recent first; none before
 * the first swipe) and `next` under the back tile (the rest of the deck order). The first
 * SECTION_PREVIEW_DEPTH of each show their edge; the others are hidden, parked under the same
 * pile. Both empty when the group is not collapsible.
 */
export function deckUnder(
  items: ReadonlyArray<{ pinnedInGroup?: boolean | null }>,
  swiped = 0,
  enabled = true,
): { pile: number[]; next: number[] } {
  if (!isCollapsibleGroup(items.length, enabled)) return { pile: [], next: [] }
  const order = deckOrder(items)
  const at = clampSwiped(swiped, order.length)
  return { pile: order.slice(0, at).reverse(), next: order.slice(at + SECTION_PREVIEW_SIZE) }
}

/**
 * Where tile `index` lies when it is not one of the two deck tiles: the pile it is under
 * (`data-under`) and, while its edge shows, its depth (`data-depth`: 1 = right under the
 * pile's top tile … SECTION_PREVIEW_DEPTH). Undefined for a deck tile.
 */
export function deckLayer(
  under: { pile: readonly number[]; next: readonly number[] },
  index: number,
): { under: 'pile' | 'next'; depth?: number } | undefined {
  for (const pile of ['pile', 'next'] as const) {
    const at = under[pile].indexOf(index)
    if (at >= 0) return { under: pile, depth: at < SECTION_PREVIEW_DEPTH ? at + 1 : undefined }
  }
  return undefined
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

/**
 * Day and full month name of an item's start date for an imageless hand tile's date cover
 * (FR-098), e.g. `{ day: '14', month: 'noiembrie' }`; null when undated or unparseable.
 */
export function tileDate(data: Record<string, unknown>, dateLocale = 'ro-RO'): { day: string; month: string } | null {
  const raw = typeof data.startDate === 'string' && data.startDate ? data.startDate : data.date
  if (typeof raw !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (!m) return null
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(date.getTime())) return null
  const month = new Intl.DateTimeFormat(dateLocale, { month: 'long', timeZone: 'UTC' }).format(date)
  return { day: String(Number(m[3])), month }
}

/**
 * Tint of a hand tile's date cover (FR-098): the accent of the item's own site when it
 * belongs to exactly one site, otherwise null (the neutral wash). Only hex colours pass,
 * because the value lands in a style attribute.
 */
export function tileTint(itemSites: readonly string[], sites: ReadonlyArray<{ slug: string; accent: string }>): string | null {
  if (itemSites.length !== 1) return null
  const accent = sites.find(s => s.slug === itemSites[0])?.accent
  return accent && /^#[0-9a-fA-F]{3,8}$/.test(accent) ? accent : null
}
