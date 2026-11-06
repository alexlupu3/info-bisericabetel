import { useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'

/**
 * Expanded sidebar or icon rail (FR-107). The editor's choice is remembered per device in
 * `localStorage['betel-admin-sidebar']`; without one the sidebar is expanded from 1024 px
 * and a rail from 768 to 1023 px.
 */

export const SIDEBAR_STORAGE_KEY = 'betel-admin-sidebar'
type SidebarState = 'expanded' | 'collapsed'

function readStored(): SidebarState | null {
  try {
    const v = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    return v === 'expanded' || v === 'collapsed' ? v : null
  } catch {
    return null
  }
}

export function useSidebarPreference() {
  const wide = useMediaQuery('(min-width: 1024px)')
  const [stored, setStored] = useState<SidebarState | null>(readStored)
  const state: SidebarState = stored ?? (wide ? 'expanded' : 'collapsed')

  const toggle = () => {
    const next: SidebarState = state === 'expanded' ? 'collapsed' : 'expanded'
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next) } catch { /* private mode: keep it in memory */ }
    setStored(next)
  }

  return { collapsed: state === 'collapsed', toggle }
}
