import ReactMarkdown from 'react-markdown'
import type { ContentItem } from '../../api/client'
import SiteLabel from './SiteLabel'
import { track } from '../../api/track'
import { useLanguage } from '../../context/LanguageContext'

type CardData = {
  title: string
  description?: string
  thumbnail?: string
  startDate?: string
  date?: string       // legacy field — new cards use startDate
  endDate?: string
  link?: string
  cta?: string
  siteLinks?: Record<string, string>
}

function ExternalLinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 13L13 3M13 3H6M13 3V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function CardItem({
  item,
  accent,
  variant = 'stacked',
  activeSite = null,
  showSiteLabel = false,
}: {
  item: ContentItem
  accent: string
  variant?: 'stacked' | 'horizontal'
  activeSite?: string | null
  showSiteLabel?: boolean
}) {
  const d = item.data as CardData
  const resolvedLink = (activeSite && d.siteLinks?.[activeSite]) || d.link
  const { dateLocale } = useLanguage()
  const dateStr = formatDateRange(d.startDate ?? d.date, d.endDate, dateLocale)

  if (variant === 'horizontal') {
    const article = (
      <article className={`relative border border-[var(--border)] bg-[var(--surface)] overflow-hidden flex flex-col sm:flex-row sm:items-start${resolvedLink ? ' transition-colors duration-200 group-hover:bg-[var(--accent)]/5' : ''}`}>
        {d.thumbnail && (
          <div className="aspect-[16/9] sm:w-1/2 overflow-hidden bg-[var(--surface)] flex-shrink-0">
            <img
              src={d.thumbnail}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-5 flex flex-col justify-between flex-1 gap-3">
          <div>
            {dateStr && (
              <p className="text-[10px] tracking-widest uppercase font-content mb-2 text-[var(--muted)]">
                {dateStr}
              </p>
            )}
            <h2 className="betel-title-bold text-xl leading-tight mb-2">{d.title}</h2>
            <SiteLabel sites={item.sites} showInAllSites={showSiteLabel} />
            {d.description && (
              <div className="font-content text-sm text-[var(--muted)] leading-relaxed prose prose-sm max-w-none">
                <ReactMarkdown>{d.description}</ReactMarkdown>
              </div>
            )}
          </div>
          {resolvedLink && d.cta && (
            <span className="self-start inline-block px-4 py-2 text-xs tracking-widest uppercase font-content border border-[var(--text)] text-[var(--text)]">
              {d.cta}
            </span>
          )}
        </div>
        {resolvedLink && !d.cta && (
          <span className="absolute bottom-3 right-3 text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors duration-200">
            <ExternalLinkIcon />
          </span>
        )}
      </article>
    )

    if (resolvedLink) {
      return (
        <a
          href={resolvedLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('link_click', activeSite, item.id, resolvedLink)}
          className="group block cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
        >
          {article}
        </a>
      )
    }

    return article
  }

  const article = (
    <article className={`relative border border-[var(--border)] bg-[var(--surface)] overflow-hidden${resolvedLink ? ' transition-colors duration-200 group-hover:bg-[var(--accent)]/5' : ''}`}>
      {d.thumbnail && (
        <div className="aspect-[16/9] overflow-hidden bg-[var(--surface)]">
          <img
            src={d.thumbnail}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-4">
        {dateStr && (
          <p className="text-[10px] tracking-widest uppercase font-content mb-2 text-[var(--muted)]">
            {dateStr}
          </p>
        )}
        <h2 className="betel-title-bold text-xl leading-tight mb-2">{d.title}</h2>
        <SiteLabel sites={item.sites} showInAllSites={showSiteLabel} />
        {d.description && (
          <div className="font-content text-sm text-[var(--muted)] leading-relaxed mb-4 prose prose-sm max-w-none">
            <ReactMarkdown>{d.description}</ReactMarkdown>
          </div>
        )}
        {resolvedLink && d.cta && (
          <span className="self-start inline-block px-4 py-2 text-xs tracking-widest uppercase font-content border border-[var(--text)] text-[var(--text)]">
            {d.cta}
          </span>
        )}
      </div>
      {resolvedLink && !d.cta && (
        <span className="absolute bottom-3 right-3 text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors duration-200">
          <ExternalLinkIcon />
        </span>
      )}
    </article>
  )

  if (resolvedLink) {
    return (
      <a
        href={resolvedLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('link_click', activeSite, item.id, resolvedLink)}
        className="group block cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
      >
        {article}
      </a>
    )
  }

  return article
}

function formatDateRange(start?: string, end?: string, dateLocale = 'ro-RO') {
  if (!start) return null
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' })
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start)
}
