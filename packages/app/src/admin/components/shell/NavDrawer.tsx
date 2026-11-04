import { useRef, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { User } from '../../api/client'
import { navItemForPath } from '../../navigation'
import Dialog from '../ui/Dialog'
import { NavFooter, NavMenu, navPath } from './NavContent'
import { DRAWER_ID, FAB_CLASS, FabFace } from './NavFab'

/** The drawer is open exactly while the current history entry carries this flag (FR-108). */
export const DRAWER_STATE_KEY = 'adminDrawer'

export function isDrawerState(state: unknown): boolean {
  return !!(state && typeof state === 'object' && (state as Record<string, unknown>)[DRAWER_STATE_KEY])
}

/**
 * Phone navigation drawer (FR-108), built on the dialog primitive. History contract:
 * opening pushes one entry for the same URL with `{ adminDrawer: true }`; Back, `Esc`,
 * the backdrop and × pop it (`navigate(-1)`); a link replaces it with the destination.
 */
export default function NavDrawer({ user, fabRef, onLogout }: {
  user: User
  fabRef: RefObject<HTMLButtonElement | null>
  onLogout: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const activeLinkRef = useRef<HTMLAnchorElement>(null)
  const navigatedByLink = useRef(false)
  const close = () => navigate(-1)

  return (
    <Dialog
      id={DRAWER_ID}
      testId="nav-drawer"
      ariaLabel="Meniu admin"
      layout="drawer"
      kind="drawer"
      header={false}
      onRequestClose={close}
      initialFocusRef={activeLinkRef}
      returnFocus={() => navigatedByLink.current ? document.getElementById('admin-main') : fabRef.current}
      outside={
        <button
          type="button"
          data-testid="nav-drawer-close"
          onClick={close}
          aria-label="Închide meniul"
          className={`${FAB_CLASS} flex`}
        >
          <FabFace open />
        </button>
      }
    >
      <div className="flex items-center h-14 px-5 flex-shrink-0 border-b border-[var(--border)]">
        <span className="text-sm whitespace-nowrap">
          <span className="betel-title-bold">BETEL</span>
          {' '}
          <span className="betel-title-condensed">ADMIN</span>
        </span>
      </div>
      <nav aria-label="Navigare admin" className="flex-1 overflow-y-auto overscroll-contain">
        <NavMenu
          role={user.role}
          collapsed={false}
          activeLinkRef={activeLinkRef}
          onLinkClick={(item, e) => {
            e.preventDefault()
            if (navItemForPath(location.pathname)?.id === item.id) { close(); return }
            navigatedByLink.current = true
            navigate(navPath(item), { replace: true })
          }}
        />
      </nav>
      {/* Bottom padding keeps "Ieșire" clear of the × drawn at the FAB position. */}
      <div className="pb-20">
        <NavFooter user={user} collapsed={false} onLogout={onLogout} />
      </div>
    </Dialog>
  )
}
