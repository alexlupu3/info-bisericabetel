import type { ContentItem } from '../../api/client'
import SiteLabel from './SiteLabel'
import { track } from '../../api/track'

type CardData = {
  title: string
  description?: string
  thumbnail?: string
  startDate?: string
  date?: string       // legacy field — new cards use startDate
  endDate?: string
  link?: string
  cta?: string
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
  const dateStr = formatDateRange(d.startDate ?? d.date, d.endDate)

  if (variant === 'horizontal') {
    const article = (
      <article className={`border border-[var(--border)] bg-[var(--surface)] overflow-hidden flex flex-col sm:flex-row sm:items-start${d.link ? ' transition-colors duration-200 group-hover:bg-[var(--accent)]/5' : ''}`}>
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
              <p className="font-content text-sm text-[var(--muted)] leading-relaxed">
                {d.description}
              </p>
            )}
          </div>
          {d.link && (
            <span className="self-start inline-block px-4 py-2 text-xs tracking-widest uppercase font-content border border-[var(--text)] text-[var(--text)]">
              {d.cta ?? 'Află mai mult'}
            </span>
          )}
        </div>
      </article>
    )

    if (d.link) {
      return (
        <a
          href={d.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('link_click', activeSite, item.id, d.link)}
          className="group block cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
        >
          {article}
        </a>
      )
    }

    return article
  }

  const article = (
    <article className={`border border-[var(--border)] bg-[var(--surface)] overflow-hidden${d.link ? ' transition-colors duration-200 group-hover:bg-[var(--accent)]/5' : ''}`}>
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
          <p className="font-content text-sm text-[var(--muted)] leading-relaxed mb-4">
            {d.description}
          </p>
        )}
        {d.link && (
          <span className="self-start inline-block px-4 py-2 text-xs tracking-widest uppercase font-content border border-[var(--text)] text-[var(--text)]">
            {d.cta ?? 'Află mai mult'}
          </span>
        )}
      </div>
    </article>
  )

  if (d.link) {
    return (
      <a
        href={d.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('link_click', activeSite, item.id, d.link)}
        className="group block cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
      >
        {article}
      </a>
    )
  }

  return article
}

function formatDateRange(start?: string, end?: string) {
  if (!start) return null
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start)
}
