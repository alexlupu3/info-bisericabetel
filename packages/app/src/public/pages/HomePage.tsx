import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSite } from '../hooks/useSite'
import { useTheme } from '../hooks/useTheme'
import SiteSwitcher from '../components/SiteSwitcher'
import ContentRenderer from '../components/content/ContentRenderer'
import GroupBlock from '../components/content/GroupBlock'
import { api, type ContentItem } from '../api/client'
import { track } from '../api/track'

export default function HomePage() {
  const { activeSite, site, accent, selectSite } = useSite()
  const { theme, toggle } = useTheme()

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
  }, [accent])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['content', activeSite],
    queryFn: () => api.content(activeSite),
  })

  useEffect(() => {
    if (data) track('site_visit', activeSite)
  }, [data, activeSite])

  const boldPart  = site ? 'BETEL'    : 'BISERICA'
  const lightPart = site ? site.name.toUpperCase() : 'BETEL'

  return (
    <div className="min-h-full flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-4xl mx-auto w-full px-5 pt-10 pb-8 text-center">
          <img
            src="/icons/favicon-dark.svg"
            alt="Betel logo"
            className="mb-4 betel-logo"
            aria-hidden="true"
          />
          <h1 className="text-4xl leading-none">
            <span className="betel-title-bold">{boldPart}</span><span
              className="betel-title-condensed"
              style={site ? { color: accent } : undefined}
            >
              {lightPart}
            </span>
          </h1>
          <p className="mt-3 font-content text-sm text-[var(--muted)] leading-relaxed" data-testid="hero-subtitle">
            Rămâi la curent cu programul și activitățile bisericii Betel
          </p>
          <a
            href="https://bisericabetel.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-content text-xs text-[var(--muted)] opacity-50 hover:opacity-80 transition-opacity duration-200"
            data-testid="hero-website-link"
          >
            bisericabetel.com
          </a>
        </div>
      </header>

      {/* ── Site switcher ─────────────────────────────────────── */}
      <div className="border-b border-[var(--border)]">
        <div className="max-w-4xl mx-auto w-full">
          <SiteSwitcher activeSite={activeSite} accent={accent} onSelect={selectSite} />
        </div>
      </div>

      {/* ── Content feed ─────────────────────────────────────── */}
      <main className="flex-1 py-12" aria-label="Conținut" data-testid="content-feed">
        <div className="max-w-4xl mx-auto w-full px-5 space-y-10">
          {isLoading && <LoadingState />}
          {isError  && <ErrorState />}
          {!isLoading && !isError && data && (
            data.items.length === 0
              ? <EmptyState accent={accent} siteName={site?.name ?? null} />
              : <Feed items={data.items} accent={accent} activeSite={activeSite} showSiteLabel={activeSite === null} />
          )}
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)]">
        <div className="max-w-4xl mx-auto w-full px-5 py-6 flex items-center justify-between">
          <p className="text-[10px] tracking-widest uppercase text-[var(--muted)] font-content">
            © {new Date().getFullYear()} Biserica Baptistă Betel · Cluj-Napoca
          </p>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </footer>
    </div>
  )
}

/** Renders items, collapsing consecutive same-group items into GroupBlocks */
function Feed({ items, accent, activeSite, showSiteLabel }: { items: ContentItem[]; accent: string; activeSite: string | null; showSiteLabel: boolean }) {
  const blocks: Array<{ key: string; node: React.ReactNode }> = []
  let i = 0

  while (i < items.length) {
    const item = items[i]
    if (item.groupId) {
      const groupItems = items.filter(it => it.groupId === item.groupId)
      blocks.push({
        key: item.groupId,
        node: (
          <GroupBlock
            title={item.groupTitle ?? ''}
            items={groupItems}
            accent={accent}
            activeSite={activeSite}
            showSiteLabel={showSiteLabel}
          />
        ),
      })
      // Skip all items that belong to this group
      i += groupItems.length
    } else {
      blocks.push({
        key: item.id,
        node: <ContentRenderer item={item} accent={accent} cardVariant="horizontal" activeSite={activeSite} showSiteLabel={showSiteLabel} />,
      })
      i++
    }
  }

  return (
    <div className="space-y-8" data-testid="content-list">
      {blocks.map(b => (
        <div key={b.key}>{b.node}</div>
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
  return (
    <p className="font-content text-sm text-[var(--muted)]" data-testid="content-error">
      Nu s-a putut încărca conținutul. Încearcă din nou.
    </p>
  )
}

function EmptyState({ accent, siteName }: { accent: string; siteName: string | null }) {
  return (
    <div className="flex flex-col items-start gap-3" data-testid="content-empty">
      <span className="block w-6 h-px" style={{ backgroundColor: accent }} aria-hidden="true" />
      <p className="font-content text-sm text-[var(--muted)] leading-relaxed">
        {siteName
          ? `Nicio informație disponibilă pentru ${siteName} în momentul acesta.`
          : 'Nicio informație disponibilă în momentul acesta.'}
      </p>
      <p className="font-content text-xs text-[var(--muted)] opacity-60">
        Revino mai târziu sau selectează o altă locație.
      </p>
    </div>
  )
}

function ThemeToggle({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={theme === 'dark' ? 'Comută la modul luminos' : 'Comută la modul întunecat'}
      className="text-[var(--muted)] opacity-40 hover:opacity-70 transition-opacity duration-200 focus:outline-none"
    >
      {theme === 'dark' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
