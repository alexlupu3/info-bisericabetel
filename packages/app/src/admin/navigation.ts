import {
  AlertTriangle,
  Archive,
  BarChart3,
  Database,
  FileText,
  Image,
  Languages,
  MapPin,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { User } from './api/client'

/**
 * The admin menu, declared once (FR-106, spec 09). The sidebar, the phone drawer and the
 * super-admin route guard in `AdminApp.tsx` all read it, so a menu page is linked if and
 * only if its route is rendered for the signed-in role. Routes outside the menu (today only
 * the legacy, unlinked `/admin/groups`, ADR-002) are not covered and keep their own guard.
 *
 * Adding an admin page = one item here plus its element in `AdminApp.tsx` (`PAGE_ELEMENTS`
 * is keyed by `NavItemId`, so the compiler asks for it).
 */

export type NavItemId =
  | 'content' | 'media' | 'archive'
  | 'analytics'
  | 'locations' | 'users' | 'translations'
  | 'logs' | 'error-logs' | 'sql'

export interface NavItem {
  id: NavItemId
  /** Route path relative to `/admin/`. */
  path: string
  label: string
  icon: LucideIcon
  superAdminOnly: boolean
}

export interface NavGroup {
  id: string
  /** Group heading; only shown to super-admins (regular admins get one flat list). */
  label: string
  items: NavItem[]
}

export const ADMIN_NAV: NavGroup[] = [
  {
    id: 'content',
    label: 'Conținut',
    items: [
      { id: 'content', path: 'content', label: 'Conținut', icon: FileText, superAdminOnly: false },
      { id: 'media', path: 'media', label: 'Media', icon: Image, superAdminOnly: false },
      { id: 'archive', path: 'archive', label: 'Arhivă', icon: Archive, superAdminOnly: false },
    ],
  },
  {
    id: 'reports',
    label: 'Rapoarte',
    items: [
      { id: 'analytics', path: 'analytics', label: 'Statistici', icon: BarChart3, superAdminOnly: false },
    ],
  },
  {
    id: 'administration',
    label: 'Administrare',
    items: [
      { id: 'locations', path: 'locations', label: 'Locații', icon: MapPin, superAdminOnly: true },
      { id: 'users', path: 'users', label: 'Utilizatori', icon: Users, superAdminOnly: true },
      { id: 'translations', path: 'translations', label: 'Traduceri', icon: Languages, superAdminOnly: true },
    ],
  },
  {
    id: 'system',
    label: 'Sistem',
    items: [
      { id: 'logs', path: 'logs', label: 'Jurnale', icon: ScrollText, superAdminOnly: true },
      { id: 'error-logs', path: 'error-logs', label: 'Erori', icon: AlertTriangle, superAdminOnly: true },
      { id: 'sql', path: 'sql', label: 'SQL', icon: Database, superAdminOnly: true },
    ],
  },
]

export type Role = User['role']

export function canSee(item: NavItem, role: Role): boolean {
  return !item.superAdminOnly || role === 'super-admin'
}

/** The menu for a role: groups with their visible items; empty groups are dropped. */
export function visibleNav(role: Role): NavGroup[] {
  return ADMIN_NAV
    .map(g => ({ ...g, items: g.items.filter(i => canSee(i, role)) }))
    .filter(g => g.items.length > 0)
}

/** Every menu page visible to a role, in menu order. */
export function visibleNavItems(role: Role): NavItem[] {
  return visibleNav(role).flatMap(g => g.items)
}

/** Regular admins get one flat list without group headings (FR-106). */
export function showsGroupHeadings(role: Role): boolean {
  return role === 'super-admin'
}

/** The menu item whose route matches an admin pathname (e.g. `/admin/media/…`), if any. */
export function navItemForPath(pathname: string): NavItem | undefined {
  const rest = pathname.replace(/^\/admin\/?/, '')
  const first = rest.split('/')[0]
  return ADMIN_NAV.flatMap(g => g.items).find(i => i.path === first)
}
