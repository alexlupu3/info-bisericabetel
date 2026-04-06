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
}

export default function ContentRenderer({ item, accent, cardVariant, activeSite = null, showSiteLabel = false }: Props) {
  switch (item.type) {
    case 'card':     return <CardItem item={item} accent={accent} variant={cardVariant} activeSite={activeSite} showSiteLabel={showSiteLabel} />
    case 'richtext': return <RichtextItem item={item} showSiteLabel={showSiteLabel} />
    case 'poster':   return <PosterItem item={item} activeSite={activeSite} showSiteLabel={showSiteLabel} />
    case 'video':    return <VideoItem item={item} showSiteLabel={showSiteLabel} />
    default:         return null
  }
}
