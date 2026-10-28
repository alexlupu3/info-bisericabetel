import type { ContentItem } from '../../api/client'
import CardItem from './CardItem'
import RichtextItem from './RichtextItem'
import PosterItem from './PosterItem'
import VideoItem from './VideoItem'

interface Props {
  item: ContentItem
  accent: string
  cardVariant?: 'stacked' | 'horizontal'
  activeSite?: string | null
  showSiteLabel?: boolean
  /** h2 at the feed root, h3 inside a group. */
  headingLevel?: 2 | 3
  /** First image of the page (eager, high priority). */
  eager?: boolean
}

export default function ContentRenderer({ item, accent, cardVariant, activeSite = null, showSiteLabel = false, headingLevel = 2, eager = false }: Props) {
  switch (item.type) {
    case 'card':     return <CardItem item={item} accent={accent} variant={cardVariant} activeSite={activeSite} showSiteLabel={showSiteLabel} headingLevel={headingLevel} eager={eager} />
    case 'richtext': return <RichtextItem item={item} showSiteLabel={showSiteLabel} headingLevel={headingLevel} />
    case 'poster':   return <PosterItem item={item} activeSite={activeSite} showSiteLabel={showSiteLabel} eager={eager} />
    case 'video':    return <VideoItem item={item} showSiteLabel={showSiteLabel} headingLevel={headingLevel} />
    default:         return null
  }
}
