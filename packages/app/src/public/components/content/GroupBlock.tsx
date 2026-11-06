import { useMemo } from 'react'
import { deckUnder, groupDomIds, groupSlug, isCollapsibleGroup, previewSlots, SECTION_PREVIEW_SIZE } from '@betel/shared'
import type { ContentItem } from '../../api/client'
import ContentRenderer from './ContentRenderer'
import { useLanguage } from '../../context/LanguageContext'
import { UI_DEFAULTS, UI_KEYS } from '../../i18n/keys'
import { useSectionPreview } from '../../hooks/useSectionPreview'

interface Props {
  groupId: string
  title: string
  items: ContentItem[]
  accent: string
  activeSite?: string | null
  showSiteLabel?: boolean
  /** Id of the page's first image-bearing item, loaded eagerly. */
  eagerItemId?: string | null
  /** Live-region text after expanding / collapsing (FR-099, FR-100). */
  onAnnounce?: (text: string) => void
  /** The group's section-preview switch (`groups.section_preview`); off = always the list. */
  preview?: boolean
}

// Keep in sync with renderGroup() in packages/api/src/services/seo/render-snapshot.ts
// (same ids, data-preview / data-slot attributes, overlay and button), ADR-022 / ADR-026.
export default function GroupBlock({ groupId, title, items, accent, activeSite = null, showSiteLabel = false, eagerItemId = null, onAnnounce, preview = true }: Props) {
  const { t } = useLanguage()
  const count = items.length
  const collapsible = isCollapsibleGroup(count, preview)
  const ids = groupDomIds(groupId)

  const vars = { title, count: String(count), shown: String(Math.min(count, SECTION_PREVIEW_SIZE)) }
  const deck = useSectionPreview({
    collapsible,
    count,
    onAnnounce,
    expandedText: t(UI_KEYS.SECTION_EXPANDED, UI_DEFAULTS[UI_KEYS.SECTION_EXPANDED], vars),
    collapsedText: t(UI_KEYS.SECTION_COLLAPSED, UI_DEFAULTS[UI_KEYS.SECTION_COLLAPSED], vars),
  })

  // Deck slot (0 = top card, 1 = the card behind it) per item index after the swipes so far, FR-097.
  const slots = useMemo(() => {
    const map = new Map<number, number>()
    previewSlots(items, deck.swiped, preview).forEach((itemIndex, slot) => map.set(itemIndex, slot))
    return map
  }, [items, deck.swiped, preview])
  // Tiles already lying under the two piles, so a swipe moves one tile only.
  const under = useMemo(() => deckUnder(items, deck.swiped, preview), [items, deck.swiped, preview])
  const collapsed = collapsible && deck.state === 'hand'
  const position = ((deck.swiped % Math.max(count, 1)) + count) % Math.max(count, 1) + 1

  return (
    <section
      aria-labelledby={ids.heading}
      id={groupSlug(title)}
      data-preview={collapsible ? deck.state : undefined}
      className="relative"
    >
      <header className="flex items-center gap-3 mb-6">
        <span className="block w-4 h-px flex-shrink-0" style={{ backgroundColor: accent }} aria-hidden="true" />
        <h2 id={ids.heading} ref={deck.headingRef} className="betel-title-bold text-sm tracking-widest uppercase">
          {title} <span className="betel-group-count">· {count}</span>
        </h2>
        {collapsed && (
          // Where the deck stands (visual only: the heading already says how many there are).
          <span className="betel-deck-count sm:hidden" aria-hidden="true" data-testid="deck-count">
            {position} / {count}
          </span>
        )}
      </header>
      <ul ref={deck.listRef} id={ids.list} data-preview-list onClickCapture={deck.onListClickCapture} className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {items.map((item, index) => {
          const slot = slots.get(index)
          const back = slot !== undefined && slot > 0
          const lying = slot === undefined ? (index === under.pile ? 'pile' : index === under.next ? 'next' : undefined) : undefined
          return (
            <li
              key={item.id}
              data-slot={slot}
              data-under={lying}
              aria-hidden={(back || lying) && deck.handVisible ? true : undefined}
            >
              <ContentRenderer
                item={item}
                accent={accent}
                activeSite={activeSite}
                showSiteLabel={showSiteLabel}
                headingLevel={3}
                eager={item.id === eagerItemId}
                previewTile={collapsible}
              />
              {back && <span data-hand-expand aria-hidden="true" />}
            </li>
          )
        })}
      </ul>
      {collapsible && collapsed && (
        <div className="sm:hidden mt-5 flex justify-center">
          <button
            ref={deck.showAllRef}
            type="button"
            className="betel-hand-button"
            aria-expanded="false"
            aria-controls={ids.list}
            onClick={() => void deck.expand()}
          >
            {t(UI_KEYS.SECTION_SHOW_ALL, UI_DEFAULTS[UI_KEYS.SECTION_SHOW_ALL], vars)}
          </button>
        </div>
      )}
      {collapsible && !collapsed && (
        <div className="betel-hand-less sm:hidden">
          <button
            type="button"
            className="betel-hand-button betel-hand-button--solid"
            aria-expanded="true"
            aria-controls={ids.list}
            onClick={() => void deck.collapse()}
          >
            {t(UI_KEYS.SECTION_SHOW_LESS, UI_DEFAULTS[UI_KEYS.SECTION_SHOW_LESS])}
          </button>
        </div>
      )}
    </section>
  )
}
