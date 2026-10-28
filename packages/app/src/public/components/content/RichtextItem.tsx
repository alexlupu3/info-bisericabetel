import ReactMarkdown from 'react-markdown'
import type { ContentItem } from '../../api/client'
import SiteLabel from './SiteLabel'

type RichtextData = { body: string; title?: string }

export default function RichtextItem({ item, showSiteLabel = false, headingLevel = 2 }: { item: ContentItem; showSiteLabel?: boolean; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  const d = item.data as RichtextData

  // Expand isolated single newlines into paragraph breaks for markdown rendering.
  // Avoids lookbehind regex which is unsupported in Safari < 16.4.
  const body = d.body.replace(/\n+/g, match => match.length === 1 ? '\n\n' : match)

  return (
    <article data-item-id={item.id} className="border-l-2 border-[var(--border)] bg-[var(--surface)] pl-4 pr-4 py-3">
      {d.title && (
        <Heading className="betel-title-bold text-lg leading-tight mb-2">{d.title}</Heading>
      )}
      <SiteLabel sites={item.sites} showInAllSites={showSiteLabel} />
      <div className="prose-betel">
        <ReactMarkdown>{body}</ReactMarkdown>
      </div>
    </article>
  )
}
