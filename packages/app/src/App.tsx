import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { SitesProvider } from './public/context/SitesContext'
import { LanguageProvider } from './public/context/LanguageContext'
import HomePage from './public/pages/HomePage'
import ErrorBoundary from './ErrorBoundary'

const AdminApp = lazy(() => import('./admin/AdminApp'))

function SharedPublicRoute() {
  return (
    <ErrorBoundary>
      <SitesProvider>
        <LanguageProvider>
          <HomePage />
        </LanguageProvider>
      </SitesProvider>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SharedPublicRoute />} />
      <Route path="/:siteSlug" element={<SharedPublicRoute />} />
      <Route path="/admin/*" element={
        <Suspense fallback={null}>
          <AdminApp />
        </Suspense>
      } />
    </Routes>
  )
}
