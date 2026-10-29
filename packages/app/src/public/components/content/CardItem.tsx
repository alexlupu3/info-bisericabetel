import ReactMarkdown from 'react-markdown'
import { itemWhen, readLocation } from '@betel/shared'
import type { ContentItem } from '../../api/client'
import SiteLabel from './SiteLabel'
import FeedImage from './FeedImage'
import EventLocation from './EventLocation'
import { track } from '../../api/track'
import { useLanguage } from '../../context/LanguageContext'

type CardData = {
  title: string
  description?: string
  thumbnail?: string
  startDate?: string
  date?: string       // legacy field — new cards use startDate
  endDate?: string
  startTime?: string  // HH:mm, Romania wall clock; single-day events only (BR-035)
  location?: string   // free-text venue, ≤ 70 characters (BR-050)
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
  accent: _accent,
  variant = 'stacked',
  activeSite = null,
  showSiteLabel = false,
  headingLevel = 2,
  eager = false,
}: {
  item: ContentItem
  accent: string
  variant?: 'stacked' | 'horizontal'
  activeSite?: string | null
  showSiteLabel?: boolean
  /** h2 at the feed root, h3 inside a group (FR-072: no skipped heading levels). */
  headingLevel?: 2 | 3
  /** First image of the page: loaded eagerly with high priority (LCP). */
  eager?: boolean
}) {
  const d = item.data as CardData
  const resolvedLink = (activeSite && d.siteLinks?.[activeSite]) || d.link
  const { dateLocale } = useLanguage()
  // Same date line as the server-rendered snapshot (spec 03): text + ISO for <time> (spec 04).
  const when = itemWhen(item.data, dateLocale)
  const location = readLocation(item.data)
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  const horizontal = variant === 'horizontal'

  const dateLine = when && (
    <p className="text-[10px] tracking-widest uppercase font-content mb-2 text-[var(--muted)]">
      {when.dateTime ? <time dateTime={when.dateTime}>{when.text}</time> : when.text}
    </p>
  )

  const cta = resolvedLink && d.cta && (
    <span className="self-start inline-block px-4 py-2 text-xs tracking-widest uppercase font-content border border-[var(--text)] text-[var(--text)]">
      {d.cta}
    </span>
  )

  const article = (
    <article
      data-item-id={item.id}
      className={[
        'relative border border-[var(--border)] bg-[var(--surface)] overflow-hidden',
        horizontal ? 'flex flex-col sm:flex-row sm:items-start' : '',
        resolvedLink ? 'transition-colors duration-200 group-hover:bg-[var(--accent)]/5' : '',
      ].filter(Boolean).join(' ')}
    >
      {d.thumbnail && (
        <div className={`aspect-[16/9] overflow-hidden bg-[var(--surface)]${horizontal ? ' sm:w-1/2 flex-shrink-0' : ''}`}>
          <FeedImage src={d.thumbnail} alt="" width={1600} height={900} eager={eager} className="w-full h-full object-cover" />
        </div>
      )}
      <div className={horizontal ? 'p-5 flex flex-col justify-between flex-1 gap-3' : 'p-4'}>
        <div>
          {dateLine}
          {/* Pulled up to a 4px gap under the date row so both read as one metadata block. */}
          <EventLocation location={location} className={when ? '-mt-1 mb-2' : 'mb-2'} />
          <Heading className="betel-title-bold text-xl leading-tight mb-2">{d.title}</Heading>
          <SiteLabel sites={item.sites} showInAllSites={showSiteLabel} />
          {d.description && (
            <div className={`font-content text-sm text-[var(--muted)] leading-relaxed prose prose-sm max-w-none${horizontal ? '' : ' mb-4'}`}>
              <ReactMarkdown>{d.description}</ReactMarkdown>
            </div>
          )}
        </div>
        {cta}
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
