import type { ContentItem } from '../../api/client'
import SiteLabel from './SiteLabel'
import { track } from '../../api/track'

type PosterData = { imageUrl: string; alt?: string; link?: string; siteLinks?: Record<string, string> }

export default function PosterItem({ item, activeSite = null, showSiteLabel = false }: { item: ContentItem; activeSite?: string | null; showSiteLabel?: boolean }) {
  const d = item.data as PosterData
  const resolvedLink = (activeSite && d.siteLinks?.[activeSite]) || d.link

  const article = (
    <article>
      <img
        src={d.imageUrl}
        alt={d.alt ?? ''}
        className="w-full object-cover"
        loading="lazy"
      />
      <SiteLabel sites={item.sites} showInAllSites={showSiteLabel} />
    </article>
  )

  if (resolvedLink) {
    return (
      <a
        href={resolvedLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('link_click', activeSite, item.id, resolvedLink)}
        className="block cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
      >
        {article}
      </a>
    )
  }

  return article
}
