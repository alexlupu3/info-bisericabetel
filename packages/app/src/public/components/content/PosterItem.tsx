import type { ContentItem } from '../../api/client'
import SiteLabel from './SiteLabel'
import { track } from '../../api/track'
import FeedImage from './FeedImage'

type PosterData = { imageUrl: string; alt?: string; link?: string; siteLinks?: Record<string, string> }

function ExternalLinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 13L13 3M13 3H6M13 3V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function PosterItem({ item, activeSite = null, showSiteLabel = false, eager = false }: { item: ContentItem; activeSite?: string | null; showSiteLabel?: boolean; eager?: boolean }) {
  const d = item.data as PosterData
  const resolvedLink = (activeSite && d.siteLinks?.[activeSite]) || d.link

  const article = (
    <article data-item-id={item.id} className="relative overflow-hidden">
      <div className="relative">
        {/* Poster dimensions are not stored: 4:5 (the common portrait poster) is a size hint
            only — h-auto lets the real aspect ratio win once the image has loaded. */}
        <FeedImage
          src={d.imageUrl}
          alt={d.alt ?? ''}
          width={1080}
          height={1350}
          eager={eager}
          className="w-full h-auto object-cover"
        />
        {resolvedLink && (
          <>
            <style>{`
              @keyframes posterGradientPulse {
                0%, 100% { width: 75px; height: 75px; }
                50% { width: 85px; height: 85px; }
              }
            `}</style>
            <div
              className="absolute bottom-0 right-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 100% 100%, rgba(50,50,50,0.65) 0%, transparent 50%)',
                animation: 'posterGradientPulse 3s ease-in-out infinite',
                width: '80px',
                height: '80px',
              }}
            />
            <span className="absolute bottom-3 right-3 text-white">
              <ExternalLinkIcon />
            </span>
          </>
        )}
      </div>
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
