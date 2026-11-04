import { useRef, useState, type MouseEvent, type ReactNode, type Ref } from 'react'
import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import RailTooltip from './RailTooltip'

/** Row styling shared by menu links and footer actions (40 px rows, Betel uppercase type). */
export function rowClass(collapsed: boolean, active = false) {
  return `group relative flex items-center gap-3 h-10 w-full text-xs tracking-widest uppercase font-content transition-colors
    ${collapsed ? 'justify-center px-0' : 'px-5'}
    ${active
      ? 'font-bold text-[var(--text)] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-[var(--accent)]'
      : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}
    focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]`
}

/** Label that becomes visually hidden (but stays the accessible name) in the rail. */
export function RowLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return <span className={collapsed ? 'sr-only' : 'truncate'}>{children}</span>
}

/** Shows the rail tooltip while the wrapped control is hovered or focused. */
export function useRailTooltip(collapsed: boolean) {
  const [shown, setShown] = useState(false)
  const anchor = useRef<HTMLElement | null>(null)
  const handlers = collapsed
    ? {
        onMouseEnter: () => setShown(true),
        onMouseLeave: () => setShown(false),
        onFocus: () => setShown(true),
        onBlur: () => setShown(false),
      }
    : {}
  return { anchor, handlers, shown: collapsed && shown }
}

export default function SidebarLink({ id, to, label, icon: Icon, collapsed, linkRef, onClick }: {
  id: string
  to: string
  label: string
  icon: LucideIcon
  collapsed: boolean
  linkRef?: Ref<HTMLAnchorElement>
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void
}) {
  const tip = useRailTooltip(collapsed)
  return (
    <li>
      <NavLink
        to={to}
        ref={el => {
          tip.anchor.current = el
          if (typeof linkRef === 'function') linkRef(el)
          else if (linkRef) (linkRef as { current: HTMLAnchorElement | null }).current = el
        }}
        data-testid={`nav-${id}`}
        onClick={onClick}
        {...tip.handlers}
        className={({ isActive }) => rowClass(collapsed, isActive)}
      >
        {({ isActive }) => (<>
          <Icon size={16} aria-hidden="true" className={`flex-shrink-0 ${isActive ? 'text-[var(--accent)]' : ''}`} />
          <RowLabel collapsed={collapsed}>{label}</RowLabel>
        </>)}
      </NavLink>
      {tip.shown && <RailTooltip anchor={tip.anchor} label={label} />}
    </li>
  )
}
