import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { itemDisplayTitle, itemSiteSlug, pageTitle } from '@betel/shared'
import { usePageMeta } from '../hooks/usePageMeta'
import { useLanguage } from '../context/LanguageContext'
import { useSites } from '../context/SitesContext'
import { UI_DEFAULTS, UI_KEYS } from '../i18n/keys'
import PublicHero from '../components/PublicHero'
import PublicFooter from '../components/PublicFooter'
import ContentRenderer from '../components/content/ContentRenderer'
import { api, HttpError } from '../api/client'
import { seoNames } from '../initial-data'
import { isItemPast } from '../../content-expiry'

/**
 * One content item on its own URL, `/i/:itemId` (spec 03 FR-069): the canonical link of
 * an item (feeds, notifications, Event rich results). Shown in its site context — the
 * item's exclusive site or its single surfacing site — with a way back to the hub.
 * Mirrored by renderItemMain() in packages/api/src/services/seo/render-snapshot.ts.
 */
export default function ItemPage() {
  const { itemId = '' } = useParams<{ itemId: string }>()
  const sites = useSites()
  const { t, locale } = useLanguage()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['item', itemId, locale],
    queryFn: () => api.item(itemId, locale),
    // A 404/410 is an answer, not a transient failure.
    retry: (count, err) => !(err instanceof HttpError && err.status < 500) && count < 1,
  })

  // Same client-side safety net as the hub (filterCurrent): an item that ended in Romania
  // is treated as gone even if a stale response still carries it.
  const expired = !!data?.item && isItemPast(data.item)
  const item = expired ? null : data?.item ?? null
  const siteSlug = item ? itemSiteSlug(item) : null
  const site = siteSlug ? sites.find(s => s.slug === siteSlug) ?? null : null
  const accent = site?.accent ?? 'currentColor'
  const notFound = expired || (isError && error instanceof HttpError && (error.status === 404 || error.status === 410))
  const backHref = site ? `/${site.slug}` : '/'

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
  }, [accent])

  const title = item
    ? pageTitle({ kind: 'item', title: itemDisplayTitle(item), siteName: site?.name ?? null }, seoNames())
    : notFound
      ? pageTitle({ kind: 'not-found', message: UI_DEFAULTS[UI_KEYS.ITEM_NOT_FOUND] }, seoNames())
      : null
  usePageMeta(title, `/i/${itemId}`)

  return (
    <div className="min-h-full flex flex-col">
      <PublicHero site={site} accent={accent} />

      <nav className="border-b border-[var(--border)]" aria-label={t(UI_KEYS.NAV_SITES, UI_DEFAULTS[UI_KEYS.NAV_SITES])}>
        <div className="max-w-4xl mx-auto w-full px-5 py-3">
          <BackLink href={backHref} label={t(UI_KEYS.ITEM_BACK_TO_HUB, UI_DEFAULTS[UI_KEYS.ITEM_BACK_TO_HUB])} testId="item-back-link" />
        </div>
      </nav>

      <main className="flex-1 py-12" aria-label={t(UI_KEYS.SEO_FEED_LABEL, UI_DEFAULTS[UI_KEYS.SEO_FEED_LABEL])} data-testid="item-page">
        <div className="max-w-xl mx-auto w-full px-5">
          {isLoading && (
            <div className="animate-pulse space-y-3" data-testid="item-loading">
              <div className="aspect-[16/9] bg-[var(--surface)]" />
              <div className="h-6 w-2/3 bg-[var(--surface)]" />
              <div className="h-4 w-full bg-[var(--surface)]" />
            </div>
          )}

          {item && (
            <div className="betel-item-reveal">
              <ContentRenderer item={item} accent={accent} cardVariant="stacked" activeSite={site?.slug ?? null} headingLevel={2} eager />
            </div>
          )}

          {(isError || expired) && (
            <div className="flex flex-col items-start gap-4" data-testid="item-not-found">
              <span className="block w-6 h-px bg-[var(--muted)]" aria-hidden="true" />
              <p className="font-content text-sm text-[var(--muted)] leading-relaxed">
                {notFound
                  ? t(UI_KEYS.ITEM_NOT_FOUND, UI_DEFAULTS[UI_KEYS.ITEM_NOT_FOUND])
                  : t(UI_KEYS.CONTENT_ERROR, UI_DEFAULTS[UI_KEYS.CONTENT_ERROR])}
              </p>
              <BackLink href="/" label={t(UI_KEYS.ITEM_BACK_TO_HUB, UI_DEFAULTS[UI_KEYS.ITEM_BACK_TO_HUB])} testId="item-not-found-back-link" />
            </div>
          )}
        </div>
      </main>

      <PublicFooter sites={site ? [site] : []} />
    </div>
  )
}

function BackLink({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <Link
      to={href}
      data-testid={testId}
      className="group inline-flex items-center gap-2 text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors duration-150"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"
        className="transition-transform duration-200 group-hover:-translate-x-0.5">
        <path d="M7.5 2.5L4 6l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="underline-offset-4 group-hover:underline decoration-[var(--accent)]">{label}</span>
    </Link>
  )
}
