import { useId, type MouseEvent, type Ref } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Globe, LogOut, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useTheme } from '../../../public/hooks/useTheme'
import type { User } from '../../api/client'
import { navItemForPath, showsGroupHeadings, visibleNav, type NavItem } from '../../navigation'
import { useUnsavedChangesGuard } from '../../context/UnsavedChangesContext'
import SidebarLink, { RowLabel, rowClass, useRailTooltip } from './SidebarLink'
import RailTooltip from './RailTooltip'

export const navPath = (item: NavItem) => `/admin/${item.path}`

/**
 * The admin menu (FR-106) as rendered by the sidebar and the phone drawer. Regular admins
 * get one flat list; super-admins get the labelled groups (dividers in the rail).
 */
export function NavMenu({ role, collapsed, onLinkClick, activeLinkRef }: {
  role: string
  collapsed: boolean
  /** Overrides the default (guarded) link behaviour, e.g. for the drawer's history contract. */
  onLinkClick?: (item: NavItem, e: MouseEvent<HTMLAnchorElement>) => void
  activeLinkRef?: Ref<HTMLAnchorElement>
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { guard, isGuarding } = useUnsavedChangesGuard()
  const current = navItemForPath(location.pathname)
  const groups = visibleNav(role)
  const headings = showsGroupHeadings(role)
  const baseId = useId()

  const link = (item: NavItem) => (
    <SidebarLink
      key={item.id}
      id={item.id}
      to={navPath(item)}
      label={item.label}
      icon={item.icon}
      collapsed={collapsed}
      linkRef={current?.id === item.id ? activeLinkRef : undefined}
      onClick={e => {
        if (onLinkClick) { onLinkClick(item, e); return }
        if (isGuarding()) {
          e.preventDefault()
          guard(() => navigate(navPath(item)))
        }
      }}
    />
  )

  if (!headings) {
    return <ul className="py-2">{groups.flatMap(g => g.items).map(link)}</ul>
  }

  return (
    <div className="py-2">
      {groups.map((g, i) => {
        const headingId = `${baseId}-${g.id}`
        return (
          <div key={g.id} className={i > 0 ? (collapsed ? 'mt-2 pt-2 theme-divider mx-3' : 'mt-4') : ''}>
            <h2
              id={headingId}
              className={collapsed
                ? 'sr-only'
                : 'px-5 mb-1 text-[10px] tracking-[0.2em] uppercase font-content text-[var(--muted)]'}
            >
              {g.label}
            </h2>
            <ul aria-labelledby={headingId} className={collapsed ? '-mx-3' : ''}>{g.items.map(link)}</ul>
          </div>
        )
      })}
    </div>
  )
}

function FooterButton({ collapsed, icon: Icon, label, testId, onClick, href }: {
  collapsed: boolean
  icon: LucideIcon
  label: string
  testId?: string
  onClick?: () => void
  href?: string
}) {
  const tip = useRailTooltip(collapsed)
  const content = (<>
    <Icon size={16} aria-hidden="true" className="flex-shrink-0" />
    <RowLabel collapsed={collapsed}>{label}</RowLabel>
  </>)
  return (
    <li>
      {href ? (
        <a
          ref={el => { tip.anchor.current = el }}
          href={href}
          target="_blank"
          rel="noopener"
          data-testid={testId}
          {...tip.handlers}
          className={rowClass(collapsed)}
        >
          {content}
        </a>
      ) : (
        <button
          ref={el => { tip.anchor.current = el }}
          type="button"
          onClick={onClick}
          data-testid={testId}
          aria-label={collapsed ? label : undefined}
          {...tip.handlers}
          className={rowClass(collapsed)}
        >
          {content}
        </button>
      )}
      {tip.shown && <RailTooltip anchor={tip.anchor} label={label} />}
    </li>
  )
}

/** Signed-in user, public hub link, theme toggle (FR-095) and "Ieșire". */
export function NavFooter({ user, collapsed, onLogout }: { user: User; collapsed: boolean; onLogout: () => void }) {
  const { theme, toggle } = useTheme()
  const { guard } = useUnsavedChangesGuard()
  const superAdmin = user.role === 'super-admin'
  const roleLabel = superAdmin ? 'Super-admin' : 'Admin'
  const userTip = useRailTooltip(collapsed)
  const themeLabel = theme === 'dark' ? 'Temă luminoasă' : 'Temă întunecată'

  return (
    <div className="theme-divider py-2" data-testid="nav-footer">
      <div
        ref={el => { userTip.anchor.current = el }}
        tabIndex={collapsed ? 0 : undefined}
        {...userTip.handlers}
        className={`flex items-center gap-2 py-2 ${collapsed ? 'justify-center' : 'px-5'}`}
      >
        {collapsed ? (
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold uppercase
              ${superAdmin ? 'theme-selected text-[var(--accent)]' : 'theme-card text-[var(--muted)]'}`}
          >
            <span aria-hidden="true">{user.email.charAt(0)}</span>
            <span className="sr-only">{user.email}, {roleLabel}</span>
          </span>
        ) : (<>
          <span className="flex-1 min-w-0 truncate text-xs font-content" data-testid="nav-user-email">{user.email}</span>
          <span
            data-testid="nav-user-role"
            className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] tracking-wider uppercase font-content
              ${superAdmin ? 'theme-selected text-[var(--accent)]' : 'theme-card text-[var(--muted)]'}`}
          >
            {roleLabel}
          </span>
        </>)}
      </div>
      {userTip.shown && <RailTooltip anchor={userTip.anchor} label={`${user.email} · ${roleLabel}`} />}
      <ul className={collapsed ? '' : ''}>
        <FooterButton collapsed={collapsed} icon={Globe} label="Hub-ul public" href="/" testId="nav-public-hub" />
        <FooterButton
          collapsed={collapsed}
          icon={theme === 'dark' ? Sun : Moon}
          label={themeLabel}
          testId="admin-theme-toggle"
          onClick={toggle}
        />
        <FooterButton collapsed={collapsed} icon={LogOut} label="Ieșire" testId="nav-logout" onClick={() => guard(onLogout)} />
      </ul>
    </div>
  )
}
