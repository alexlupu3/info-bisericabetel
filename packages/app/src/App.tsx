import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { SitesProvider } from './public/context/SitesContext'
import { LanguageProvider } from './public/context/LanguageContext'
import HomePage from './public/pages/HomePage'
import ItemPage from './public/pages/ItemPage'
import ErrorBoundary from './ErrorBoundary'

const AdminApp = lazy(() => import('./admin/AdminApp'))

function SharedPublicRoute({ page = 'home' }: { page?: 'home' | 'item' }) {
  return (
    <ErrorBoundary>
      <SitesProvider>
        <LanguageProvider>
          {page === 'item' ? <ItemPage /> : <HomePage />}
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
      {/* Per-item page (spec 03 FR-069): the canonical URL of one content item */}
      <Route path="/i/:itemId" element={<SharedPublicRoute page="item" />} />
      <Route path="/admin/*" element={
        <Suspense fallback={null}>
          <AdminApp />
        </Suspense>
      } />
    </Routes>
  )
}
