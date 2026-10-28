import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { pageTitle } from '@betel/shared'
import { useSite } from '../hooks/useSite'
import { usePageMeta } from '../hooks/usePageMeta'
import { useLanguage } from '../context/LanguageContext'
import { useSites } from '../context/SitesContext'
import { UI_DEFAULTS, UI_KEYS } from '../i18n/keys'
import SiteSwitcher from '../components/SiteSwitcher'
import PublicHero from '../components/PublicHero'
import PublicFooter from '../components/PublicFooter'
import ContentRenderer from '../components/content/ContentRenderer'
import GroupBlock from '../components/content/GroupBlock'
import { api, type ContentItem } from '../api/client'
import { filterCurrent } from '../api/filter'
import { track } from '../api/track'
import { seoNames } from '../initial-data'

// Keep the feed markup in sync with render-snapshot.ts (server-rendered snapshot, ADR-022);
// cypress/e2e/snapshot-parity.cy.ts guards the pair.
export default function HomePage() {
  const { activeSite, site, accent, selectSite } = useSite()
  const sites = useSites()
  const { t, locale } = useLanguage()
  const { pathname } = useLocation()

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
  }, [accent])

  usePageMeta(pageTitle(site ? { kind: 'site', siteName: site.name } : { kind: 'hub' }, seoNames()), pathname)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['content', activeSite, locale],
    queryFn: () => api.content(activeSite, locale),
  })

  useEffect(() => {
    if (data) track('site_visit', activeSite)
  }, [data, activeSite])

  return (
    <div className="min-h-full flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <PublicHero site={site} accent={accent} />

      {/* ── Site switcher ─────────────────────────────────────── */}
      <nav className="border-b border-[var(--border)]" aria-label={t(UI_KEYS.NAV_SITES, UI_DEFAULTS[UI_KEYS.NAV_SITES])}>
        <div className="max-w-4xl mx-auto w-full">
          <SiteSwitcher activeSite={activeSite} accent={accent} onSelect={selectSite} />
        </div>
      </nav>

      {/* ── Content feed ─────────────────────────────────────── */}
      <main className="flex-1 py-12" aria-label={t(UI_KEYS.SEO_FEED_LABEL, UI_DEFAULTS[UI_KEYS.SEO_FEED_LABEL])} data-testid="content-feed">
        <div className="max-w-4xl mx-auto w-full px-5 space-y-10">
          {isLoading && <LoadingState />}
          {isError  && <ErrorState />}
          {!isLoading && !isError && data && (() => {
            const visibleItems = filterCurrent(data.items)
            return visibleItems.length === 0
              ? <EmptyState accent={accent} siteName={site?.name ?? null} />
              : <Feed items={visibleItems} accent={accent} activeSite={activeSite} showSiteLabel={activeSite === null} />
          })()}
        </div>
      </main>

      {/* ── Footer: site addresses (visible Church data) + copyright ── */}
      <PublicFooter sites={site ? [site] : sites} />
    </div>
  )
}

function hasImage(item: ContentItem): boolean {
  return (item.type === 'card' && !!item.data.thumbnail) || (item.type === 'poster' && !!item.data.imageUrl)
}

/** Renders items, collapsing consecutive same-group items into GroupBlocks */
function Feed({ items, accent, activeSite, showSiteLabel }: { items: ContentItem[]; accent: string; activeSite: string | null; showSiteLabel: boolean }) {
  const blocks: Array<{ key: string; items: ContentItem[]; groupTitle: string | null }> = []
  let i = 0

  while (i < items.length) {
    const item = items[i]
    if (item.groupId) {
      const groupItems = items.filter(it => it.groupId === item.groupId)
      blocks.push({ key: item.groupId, items: groupItems, groupTitle: item.groupTitle ?? '' })
      // Skip all items that belong to this group
      i += groupItems.length
    } else {
      blocks.push({ key: item.id, items: [item], groupTitle: null })
      i++
    }
  }

  // The first image in display order is the likely LCP element: load it eagerly.
  const eagerItemId = blocks.flatMap(b => b.items).find(hasImage)?.id ?? null

  return (
    <div className="space-y-8" data-testid="content-list">
      {blocks.map(b => (
        <div key={b.key}>
          {b.groupTitle !== null ? (
            <GroupBlock
              title={b.groupTitle}
              items={b.items}
              accent={accent}
              activeSite={activeSite}
              showSiteLabel={showSiteLabel}
              eagerItemId={eagerItemId}
            />
          ) : (
            <ContentRenderer
              item={b.items[0]}
              accent={accent}
              cardVariant="horizontal"
              activeSite={activeSite}
              showSiteLabel={showSiteLabel}
              headingLevel={2}
              eager={b.items[0].id === eagerItemId}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-3 animate-pulse" data-testid="content-loading">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 rounded bg-[var(--surface)]" />
      ))}
    </div>
  )
}

function ErrorState() {
  const { t } = useLanguage()
  return (
    <p className="font-content text-sm text-[var(--muted)]" data-testid="content-error">
      {t(UI_KEYS.CONTENT_ERROR, UI_DEFAULTS[UI_KEYS.CONTENT_ERROR])}
    </p>
  )
}

function EmptyState({ accent, siteName }: { accent: string; siteName: string | null }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-start gap-3" data-testid="content-empty">
      <span className="block w-6 h-px" style={{ backgroundColor: accent }} aria-hidden="true" />
      <p className="font-content text-sm text-[var(--muted)] leading-relaxed">
        {siteName
          ? t(UI_KEYS.CONTENT_EMPTY_WITH_SITE, UI_DEFAULTS[UI_KEYS.CONTENT_EMPTY_WITH_SITE], { siteName })
          : t(UI_KEYS.CONTENT_EMPTY_NO_SITE, UI_DEFAULTS[UI_KEYS.CONTENT_EMPTY_NO_SITE])}
      </p>
      <p className="font-content text-xs text-[var(--muted)] opacity-60">
        {t(UI_KEYS.CONTENT_EMPTY_HINT, UI_DEFAULTS[UI_KEYS.CONTENT_EMPTY_HINT])}
      </p>
    </div>
  )
}
