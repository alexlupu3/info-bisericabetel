import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SitesProvider } from './context/SitesContext'
import HomePage from './pages/HomePage'

export default function App() {
  return (
    <BrowserRouter>
      <SitesProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/:siteSlug" element={<HomePage />} />
        </Routes>
      </SitesProvider>
    </BrowserRouter>
  )
}
