import { useState, type ReactNode } from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ContentPage from './pages/ContentPage'
import UsersPage from './pages/UsersPage'
import GroupsPage from './pages/GroupsPage'
import LocationsPage from './pages/LocationsPage'
import MediaPage from './pages/MediaPage'
import LogsPage from './pages/LogsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ArchivePage from './pages/ArchivePage'
import TranslationsPage from './pages/TranslationsPage'
import SetupPage from './pages/SetupPage'

export default function AdminApp() {
  return (
    <div className="admin-theme">
      <AuthProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </AuthProvider>
    </div>
  )
}

function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[900px] mx-auto w-full">
      {children}
    </div>
  )
}

function Shell() {
  const { user, loading, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-xs tracking-widest uppercase font-content transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`

  return (
    <div className="h-screen flex flex-col">
      <nav className="border-b border-[var(--border)] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="text-sm">
            <span className="betel-title-bold">BETEL</span>
            {' '}
            <span className="betel-title-condensed">ADMIN</span>
          </span>
          <div className="hidden md:flex items-center gap-6">
            <NavLink to="content" className={navLinkClass}>Conținut</NavLink>
            {user.role === 'super-admin' && (
              <NavLink to="locations" className={navLinkClass}>Locații</NavLink>
            )}
            <NavLink to="media" className={navLinkClass}>Media</NavLink>
            <NavLink to="archive" className={navLinkClass}>Arhivă</NavLink>
            <NavLink to="analytics" className={navLinkClass}>Statistici</NavLink>
            {user.role === 'super-admin' && (
              <NavLink to="users" className={navLinkClass}>Utilizatori</NavLink>
            )}
            {user.role === 'super-admin' && (
              <NavLink to="logs" className={navLinkClass}>Jurnale</NavLink>
            )}
            {user.role === 'super-admin' && (
              <NavLink to="translations" className={navLinkClass}>Traduceri</NavLink>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={logout}
            className="hidden md:block text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            Ieșire
          </button>
          <button
            data-testid="hamburger-btn"
            onClick={() => setMobileMenuOpen(o => !o)}
            className="md:hidden text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Meniu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>
      {mobileMenuOpen && (
        <div
          data-testid="mobile-menu"
          className="md:hidden bg-[var(--bg)] border-b border-[var(--border)] px-5 py-3 flex flex-col gap-4"
        >
          <NavLink to="content" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>Conținut</NavLink>
          {user.role === 'super-admin' && (
            <NavLink to="locations" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>Locații</NavLink>
          )}
          <NavLink to="media" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>Media</NavLink>
          <NavLink to="archive" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>Arhivă</NavLink>
          <NavLink to="analytics" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>Statistici</NavLink>
          {user.role === 'super-admin' && (
            <NavLink to="users" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>Utilizatori</NavLink>
          )}
          {user.role === 'super-admin' && (
            <NavLink to="logs" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>Jurnale</NavLink>
          )}
          {user.role === 'super-admin' && (
            <NavLink to="translations" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>Traduceri</NavLink>
          )}
          <button onClick={() => { setMobileMenuOpen(false); logout() }}
            className="text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors text-left">
            Ieșire
          </button>
        </div>
      )}
      <div className="flex-1">
        <Routes>
          <Route index element={<Navigate to="content" replace />} />
          <Route path="content" element={<PageContainer><ContentPage /></PageContainer>} />
          <Route path="groups" element={<PageContainer><GroupsPage /></PageContainer>} />
          {user.role === 'super-admin' && (
            <Route path="locations" element={<PageContainer><LocationsPage /></PageContainer>} />
          )}
          <Route path="media" element={<PageContainer><MediaPage /></PageContainer>} />
          <Route path="archive" element={<PageContainer><ArchivePage /></PageContainer>} />
          <Route path="analytics" element={<PageContainer><AnalyticsPage /></PageContainer>} />
          {user.role === 'super-admin' && (
            <Route path="users" element={<PageContainer><UsersPage /></PageContainer>} />
          )}
          {user.role === 'super-admin' && (
            <Route path="logs" element={<LogsPage />} />
          )}
          {user.role === 'super-admin' && (
            <Route path="translations" element={<PageContainer><TranslationsPage /></PageContainer>} />
          )}
          <Route path="*" element={<Navigate to="content" replace />} />
        </Routes>
      </div>
    </div>
  )
}
