import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { SitesProvider } from './public/context/SitesContext'
import HomePage from './public/pages/HomePage'

const AdminApp = lazy(() => import('./admin/AdminApp'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={
        <SitesProvider>
          <HomePage />
        </SitesProvider>
      } />
      <Route path="/:siteSlug" element={
        <SitesProvider>
          <HomePage />
        </SitesProvider>
      } />
      <Route path="/admin/*" element={
        <Suspense fallback={null}>
          <AdminApp />
        </Suspense>
      } />
    </Routes>
  )
}
