import type { ContentItem } from '../../api/client'
import ContentRenderer from './ContentRenderer'

interface Props {
  title: string
  items: ContentItem[]
  accent: string
  activeSite?: string | null
  showSiteLabel?: boolean
}

export default function GroupBlock({ title, items, accent, activeSite = null, showSiteLabel = false }: Props) {
  return (
    <section aria-label={title}>
      <header className="flex items-center gap-3 mb-6">
        <span className="block w-4 h-px flex-shrink-0" style={{ backgroundColor: accent }} />
        <h2 className="betel-title-bold text-sm tracking-widest uppercase">{title}</h2>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(item => (
          <ContentRenderer key={item.id} item={item} accent={accent} activeSite={activeSite} showSiteLabel={showSiteLabel} />
        ))}
      </div>
    </section>
  )
}
