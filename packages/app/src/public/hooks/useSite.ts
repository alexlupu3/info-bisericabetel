import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Site } from '@betel/shared'
import { useSites } from '../context/SitesContext'
import { safeGet, safeSet, safeRemove } from '../utils/storage'

const STORAGE_KEY = 'betel-site'

export function useSite() {
  const sites = useSites()
  const { siteSlug } = useParams<{ siteSlug?: string }>()
  const navigate = useNavigate()

  const storedSlug = typeof window !== 'undefined'
    ? safeGet(STORAGE_KEY)
    : null

  // Trust URL slug; fall back to stored slug (will be null if not found in sites once loaded)
  const initial = siteSlug ?? storedSlug ?? null

  const [activeSite, setActiveSite] = useState<string | null>(initial)

  // Sync URL slug → state on navigation
  useEffect(() => {
    if (siteSlug) {
      setActiveSite(siteSlug)
      safeSet(STORAGE_KEY, siteSlug)
    }
  }, [siteSlug])

  // Once sites load, clear a stored slug that no longer exists
  useEffect(() => {
    if (sites.length === 0 || siteSlug) return
    if (activeSite && !sites.some(s => s.slug === activeSite)) {
      setActiveSite(null)
      safeRemove(STORAGE_KEY)
    }
  }, [sites, activeSite, siteSlug])

  const selectSite = (slug: string | null) => {
    setActiveSite(slug)
    if (slug) {
      safeSet(STORAGE_KEY, slug)
      navigate(`/${slug}`, { replace: true })
    } else {
      safeRemove(STORAGE_KEY)
      navigate('/', { replace: true })
    }
  }

  const site: Site | null = activeSite
    ? (sites.find(s => s.slug === activeSite) ?? null)
    : null

  const accent = site?.accent ?? 'currentColor'

  return { activeSite, site, accent, selectSite }
}
