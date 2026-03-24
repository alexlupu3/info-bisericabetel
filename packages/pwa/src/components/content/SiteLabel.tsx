import { useSites } from '../../context/SitesContext'

interface Props {
  sites: string[]
  showInAllSites: boolean
}

/**
 * Renders a small italic label with the site name(s) using their accent color.
 * Only renders when:
 *  - The user is viewing "all sites" (showInAllSites is true)
 *  - The item is scoped to specific sites (sites array is non-empty)
 */
export default function SiteLabel({ sites, showInAllSites }: Props) {
  const allSites = useSites()

  if (!showInAllSites || sites.length === 0) return null

  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 -mt-1 mb-3" data-testid="site-label">
      {sites.map(slug => {
        const site = allSites.find(s => s.slug === slug)
        if (!site) return null
        return (
          <span
            key={slug}
            className="text-xs italic font-content"
            style={{ color: site.accent }}
          >
            {site.name}
          </span>
        )
      })}
    </div>
  )
}
