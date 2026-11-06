import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../public/hooks/useTheme'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { UnsavedChangesProvider, useDisplayLocation } from './context/UnsavedChangesContext'
import { visibleNavItems, type NavItemId } from './navigation'
import { DESKTOP_QUERY, useMediaQuery } from './hooks/useMediaQuery'
import AdminSidebar from './components/shell/AdminSidebar'
import MobileHeader from './components/shell/MobileHeader'
import NavFab from './components/shell/NavFab'
import NavDrawer, { DRAWER_STATE_KEY, isDrawerState } from './components/shell/NavDrawer'
import type { User } from './api/client'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ContentPage from './pages/ContentPage'
import UsersPage from './pages/UsersPage'
import GroupsPage from './pages/GroupsPage'
import LocationsPage from './pages/LocationsPage'
import MediaPage from './pages/MediaPage'
import LogsPage from './pages/LogsPage'
import ErrorLogsPage from './pages/ErrorLogsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ArchivePage from './pages/ArchivePage'
import TranslationsPage from './pages/TranslationsPage'
import SetupPage from './pages/SetupPage'
import SqlConsolePage from './pages/SqlConsolePage'

export default function AdminApp() {
  // Scope the admin tokens to <html> so the page background follows the
  // theme past the first viewport when content scrolls.
  useLayoutEffect(() => {
    document.documentElement.classList.add('admin-theme')
    return () => document.documentElement.classList.remove('admin-theme')
  }, [])

  return (
    <AuthProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </AuthProvider>
  )
}

function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[900px] mx-auto w-full">
      {children}
    </div>
  )
}

/**
 * The element of every menu page. Keyed by `NavItemId`, so a page added to
 * `navigation.ts` must get its element here; the route is rendered only for the roles
 * that see it in the menu (FR-106: a menu page is linked iff its route is rendered).
 */
const PAGE_ELEMENTS: Record<NavItemId, ReactNode> = {
  content: <PageContainer><ContentPage /></PageContainer>,
  media: <PageContainer><MediaPage /></PageContainer>,
  archive: <PageContainer><ArchivePage /></PageContainer>,
  analytics: <PageContainer><AnalyticsPage /></PageContainer>,
  locations: <PageContainer><LocationsPage /></PageContainer>,
  users: <PageContainer><UsersPage /></PageContainer>,
  translations: <PageContainer><TranslationsPage /></PageContainer>,
  logs: <LogsPage />,
  'error-logs': <ErrorLogsPage />,
  sql: <SqlConsolePage />,
}

function Shell() {
  const { user, loading } = useAuth()

  if (loading) return <div className="min-h-full flex items-center justify-center">
    <span className="text-[var(--muted)] text-sm font-content">Loading…</span>
  </div>

  if (!user) return <Routes>
    <Route path="setup" element={<SetupPage onDone={() => {}} />} />
    <Route path="*" element={<LoginPage />} />
  </Routes>

  if (user.mustChangePassword) return <Routes>
    <Route path="*" element={<ChangePasswordPage />} />
  </Routes>

  return (
    <UnsavedChangesProvider>
      <SignedInShell user={user} />
    </UnsavedChangesProvider>
  )
}

function SignedInShell({ user }: { user: User }) {
  const { logout } = useAuth()
  const location = useLocation()
  const displayLocation = useDisplayLocation()
  const navigate = useNavigate()
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const fabRef = useRef<HTMLButtonElement>(null)
  // Apply the stored / system theme on load; on phones the toggle only mounts with the drawer.
  useTheme()
  const drawerOpen = !desktop && isDrawerState(location.state)

  // A reload restores history.state: never come back with the drawer open (FR-108).
  useEffect(() => {
    if (!isDrawerState(location.state)) return
    const { [DRAWER_STATE_KEY]: _, ...rest } = location.state as Record<string, unknown>
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: Object.keys(rest).length ? rest : null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openDrawer = () => navigate(`${location.pathname}${location.search}${location.hash}`, {
    state: { ...(location.state as Record<string, unknown> | null), [DRAWER_STATE_KEY]: true },
  })

  return (
    <div data-testid="admin-shell" className="min-h-full md:flex">
      <a
        href="#admin-main"
        onClick={e => { e.preventDefault(); document.getElementById('admin-main')?.focus() }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[var(--z-toast)]
                   focus:px-4 focus:py-2 focus:bg-[var(--text)] focus:text-[var(--bg)] text-xs tracking-widest uppercase font-content"
      >
        Sari la conținut
      </a>
      {desktop ? (
        <AdminSidebar user={user} onLogout={logout} />
      ) : (<>
        <MobileHeader />
        <NavFab ref={fabRef} open={drawerOpen} onOpen={openDrawer} />
        {drawerOpen && <NavDrawer user={user} fabRef={fabRef} onLogout={logout} />}
      </>)}
      <main id="admin-main" tabIndex={-1} className="flex-1 min-w-0 pb-28 md:pb-0 focus:outline-none">
        <Routes location={displayLocation}>
          <Route index element={<Navigate to="content" replace />} />
          {/* Legacy, intentionally unlinked (ADR-002); outside the menu invariant. */}
          <Route path="groups" element={<PageContainer><GroupsPage /></PageContainer>} />
          {visibleNavItems(user.role).map(item => (
            <Route key={item.id} path={item.path} element={PAGE_ELEMENTS[item.id]} />
          ))}
          <Route path="*" element={<Navigate to="content" replace />} />
        </Routes>
      </main>
    </div>
  )
}
