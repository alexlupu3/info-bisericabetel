import { Link } from 'react-router-dom'
import { siteAddressLine, type Site } from '@betel/shared'

function telHref(telephone: string): string {
  return `tel:${telephone.replace(/[^\d+]/g, '')}`
}

function hasGeo(site: Site): boolean {
  return typeof site.latitude === 'number' && typeof site.longitude === 'number'
}

/**
 * Site names with their address line (and phone / map link when set): the visible
 * counterpart of each site's schema.org `Church` markup (spec 03 §6.2.3). Mirrored by
 * renderSiteAddress() in packages/api/src/services/seo/render-snapshot.ts.
 */
export default function SiteAddressList({ sites }: { sites: Site[] }) {
  if (sites.length === 0) return null
  return (
    <ul className="mb-5 space-y-1.5 text-[10px] tracking-widest uppercase text-[var(--muted)] font-content" data-testid="site-addresses">
      {sites.map(site => {
        const address = siteAddressLine(site)
        return (
          <li key={site.slug} className="flex flex-wrap items-center gap-x-2 gap-y-0.5" data-testid={`site-address-${site.slug}`}>
            <span className="block w-2 h-px flex-shrink-0" style={{ backgroundColor: site.accent }} aria-hidden="true" />
            <Link to={`/${site.slug}`} className="font-bold text-[var(--text)] hover:underline underline-offset-2">
              {site.name}
            </Link>
            {address && <span>{address}</span>}
            {site.telephone && (
              <a href={telHref(site.telephone)} className="hover:underline underline-offset-2">{site.telephone}</a>
            )}
            {hasGeo(site) && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline underline-offset-2"
              >
                Google Maps
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
