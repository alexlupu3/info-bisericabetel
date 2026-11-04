// Section preview ("hand of cards") on phones — spec 08, FR-096 / FR-097, BR-055 / BR-056.
// Shared by the public app (GroupBlock) and the server-rendered snapshot so both
// pick the same tiles.

/** Tiles in a collapsed group (FR-096). */
export const SECTION_PREVIEW_SIZE = 3

/** A group collapses on phones when it has more visible items than the hand shows. */
export function isCollapsibleGroup(visibleCount: number): boolean {
  return visibleCount > SECTION_PREVIEW_SIZE
}

/**
 * Indexes (into the group's visible items, group order) of the hand tiles,
 * front first (FR-097): pinned items in group order (at most 3), then unpinned
 * items in group order. `[]` when the group is not collapsible. A missing
 * `pinnedInGroup` (responses cached before the column existed) reads as `false`.
 */
export function previewSlots(items: ReadonlyArray<{ pinnedInGroup?: boolean | null }>): number[] {
  if (!isCollapsibleGroup(items.length)) return []
  const pinned: number[] = []
  const unpinned: number[] = []
  items.forEach((item, index) => {
    ;(item.pinnedInGroup === true ? pinned : unpinned).push(index)
  })
  return [...pinned, ...unpinned].slice(0, SECTION_PREVIEW_SIZE)
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
