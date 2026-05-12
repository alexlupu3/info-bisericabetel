import ReactMarkdown from 'react-markdown'
import type { ContentItem } from '../../api/client'
import SiteLabel from './SiteLabel'

type RichtextData = { body: string; title?: string }

export default function RichtextItem({ item, showSiteLabel = false }: { item: ContentItem; showSiteLabel?: boolean }) {
  const d = item.data as RichtextData

  // Expand isolated single newlines into paragraph breaks for markdown rendering.
  // Avoids lookbehind regex which is unsupported in Safari < 16.4.
  const body = d.body.replace(/\n+/g, match => match.length === 1 ? '\n\n' : match)

  return (
    <article className="border-l-2 border-[var(--border)] bg-[var(--surface)] pl-4 pr-4 py-3">
      {d.title && (
        <h2 className="betel-title-bold text-lg leading-tight mb-2">{d.title}</h2>
      )}
      <SiteLabel sites={item.sites} showInAllSites={showSiteLabel} />
      <div className="prose-betel">
        <ReactMarkdown>{body}</ReactMarkdown>
      </div>
    </article>
  )
}
