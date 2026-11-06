import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { User } from '../../api/client'
import { NavFooter, NavMenu } from './NavContent'
import { useSidebarPreference } from './useSidebarPreference'

export const SIDEBAR_ID = 'admin-sidebar'

/** Desktop sidebar, ≥ 768 px (FR-105, FR-107): expanded (240 px) or icon rail (64 px). */
export default function AdminSidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { collapsed, toggle } = useSidebarPreference()
  const toggleLabel = collapsed ? 'Extinde meniul' : 'Restrânge meniul'

  return (
    <aside
      id={SIDEBAR_ID}
      data-testid="admin-sidebar"
      data-state={collapsed ? 'collapsed' : 'expanded'}
      className={`sticky top-0 h-[100dvh] flex-shrink-0 flex flex-col overflow-y-auto overflow-x-hidden
        theme-card z-[var(--z-sidebar)]
        transition-[width] duration-200 ease-out motion-reduce:transition-none
        ${collapsed ? 'w-16' : 'w-60'}`}
    >
      <div className={`flex items-center h-14 flex-shrink-0 theme-divider ${collapsed ? 'flex-col justify-center gap-1 h-auto py-3' : 'justify-between pl-5 pr-3'}`}>
        {collapsed ? (
          <span className="text-sm betel-title-bold leading-none" aria-label="Betel admin">
            B<span aria-hidden="true" className="block w-3 h-0.5 mt-1 mx-auto bg-[var(--accent)]" />
          </span>
        ) : (
          <span className="text-sm whitespace-nowrap">
            <span className="betel-title-bold">BETEL</span>
            {' '}
            <span className="betel-title-condensed relative">
              ADMIN
              <span aria-hidden="true" className="absolute left-0 right-0 -bottom-0.5 h-px bg-[var(--accent)]" />
            </span>
          </span>
        )}
        <button
          type="button"
          data-testid="sidebar-collapse"
          onClick={toggle}
          aria-controls={SIDEBAR_ID}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="p-2 text-[var(--muted)] hover:text-[var(--text)] transition-colors
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <nav aria-label="Navigare admin" className="flex-1">
        <NavMenu role={user.role} collapsed={collapsed} />
      </nav>
      <NavFooter user={user} collapsed={collapsed} onLogout={onLogout} />
    </aside>
  )
}
