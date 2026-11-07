import { useLocation } from 'react-router-dom'
import { navItemForPath } from '../../navigation'

/** Slim phone header (< 768 px): brand + current page. Not sticky; it carries no controls. */
export default function MobileHeader() {
  const { pathname } = useLocation()
  const current = navItemForPath(pathname)
  return (
    <header className="flex items-center justify-between gap-4 px-4 py-3 theme-divider">
      <span className="text-sm whitespace-nowrap">
        <span className="betel-title-bold">BETEL</span>
        {' '}
        <span className="betel-title-condensed">ADMIN</span>
      </span>
      {current && (
        <span data-testid="mobile-header-page" className="text-xs tracking-widest uppercase font-content text-[var(--muted)] truncate">
          {current.label}
        </span>
      )}
    </header>
  )
}
