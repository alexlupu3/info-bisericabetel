import { useCallback, useMemo } from 'react'
import { groupDomIds, groupSlug, isCollapsibleGroup, previewSlots, SECTION_PREVIEW_SIZE } from '@betel/shared'
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
}

// Keep in sync with renderGroup() in packages/api/src/services/seo/render-snapshot.ts
// (same ids, data-preview / data-slot attributes, overlay and button), ADR-022 / ADR-026.
export default function GroupBlock({ groupId, title, items, accent, activeSite = null, showSiteLabel = false, eagerItemId = null, onAnnounce }: Props) {
  const { t } = useLanguage()
  const count = items.length
  const collapsible = isCollapsibleGroup(count)
  const ids = groupDomIds(groupId)

  // Hand slot (0 = front tile) per item index, FR-097.
  const slots = useMemo(() => {
    const map = new Map<number, number>()
    previewSlots(items).forEach((itemIndex, slot) => map.set(itemIndex, slot))
    return map
  }, [items])
  const slotOf = useCallback((index: number) => slots.get(index), [slots])

  const vars = { title, count: String(count), shown: String(Math.min(count, SECTION_PREVIEW_SIZE)) }
  const preview = useSectionPreview({
    collapsible,
    slotOf,
    onAnnounce,
    expandedText: t(UI_KEYS.SECTION_EXPANDED, UI_DEFAULTS[UI_KEYS.SECTION_EXPANDED], vars),
    collapsedText: t(UI_KEYS.SECTION_COLLAPSED, UI_DEFAULTS[UI_KEYS.SECTION_COLLAPSED], vars),
  })
  const collapsed = collapsible && preview.state === 'hand'

  return (
    <section
      aria-labelledby={ids.heading}
      id={groupSlug(title)}
      data-preview={collapsible ? preview.state : undefined}
      className="relative"
    >
      <header className="flex items-center gap-3 mb-6">
        <span className="block w-4 h-px flex-shrink-0" style={{ backgroundColor: accent }} aria-hidden="true" />
        <h2 id={ids.heading} ref={preview.headingRef} className="betel-title-bold text-sm tracking-widest uppercase">
          {title} <span className="betel-group-count">· {count}</span>
        </h2>
      </header>
      <ul ref={preview.listRef} id={ids.list} data-preview-list className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {items.map((item, index) => {
          const slot = slots.get(index)
          const back = slot !== undefined && slot > 0
          return (
            <li
              key={item.id}
              data-slot={slot}
              aria-hidden={back && preview.handVisible ? true : undefined}
            >
              <ContentRenderer
                item={item}
                accent={accent}
                activeSite={activeSite}
                showSiteLabel={showSiteLabel}
                headingLevel={3}
                eager={item.id === eagerItemId}
                previewTile={slot !== undefined}
              />
              {back && <span data-hand-expand aria-hidden="true" onClick={preview.onExpandTarget} />}
            </li>
          )
        })}
      </ul>
      {collapsible && collapsed && (
        <div className="sm:hidden mt-5 flex justify-center">
          <button
            ref={preview.showAllRef}
            type="button"
            className="betel-hand-button"
            aria-expanded="false"
            aria-controls={ids.list}
            onClick={() => void preview.expand()}
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
            onClick={() => void preview.collapse()}
          >
            {t(UI_KEYS.SECTION_SHOW_LESS, UI_DEFAULTS[UI_KEYS.SECTION_SHOW_LESS])}
          </button>
        </div>
      )}
    </section>
  )
}
