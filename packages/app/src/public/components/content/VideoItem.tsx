import type { ContentItem } from '../../api/client'
import SiteLabel from './SiteLabel'

type VideoData = { url?: string; youtubeId?: string; title?: string }

function extractYoutubeId(raw: string | undefined): string | null {
  if (!raw) return null
  const match = raw.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  )
  return match?.[1] ?? (raw.length === 11 ? raw : null)
}

export default function VideoItem({ item, showSiteLabel = false }: { item: ContentItem; showSiteLabel?: boolean }) {
  const d = item.data as VideoData
  const videoId = extractYoutubeId(d.url ?? d.youtubeId)

  if (!videoId) return null

  return (
    <article>
      {d.title && (
        <h2 className="betel-title-bold text-lg leading-tight mb-2">{d.title}</h2>
      )}
      <SiteLabel sites={item.sites} showInAllSites={showSiteLabel} />
      <div className="relative w-full aspect-video bg-[var(--surface)]">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={d.title ?? 'Video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
          loading="lazy"
        />
      </div>
    </article>
  )
}
