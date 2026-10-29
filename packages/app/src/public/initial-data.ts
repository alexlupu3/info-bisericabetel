// Inline initial data of server-rendered public pages (spec 03 FR-070, ADR-022).
//
// The API embeds `<script id="betel-initial-data" type="application/json">` with the
// same payloads GET /api/sites, /api/languages, /api/content and /api/content/:id
// return, so the first paint needs no API round-trip. When absent (Vite dev, or the
// service worker's precached shell) the app fetches as usual.

import type { QueryClient } from '@tanstack/react-query'
import { SEO_DEFAULT_NAMES, type Language, type Site } from '@betel/shared'
import type { ContentItem } from './api/client'

export const INITIAL_DATA_ID = 'betel-initial-data'

export interface InitialSeo {
  siteName: string
  orgName: string
  orgWebsite?: string
  /** PUBLIC_BASE_URL of the server; canonical links use it. */
  baseUrl?: string
}

export interface InitialData {
  path: string
  locale: string
  sites: Site[]
  languages: Language[]
  content: { site: string | null; items: ContentItem[] } | null
  item: ContentItem | null
  seo: InitialSeo
}

let seo: InitialSeo = { ...SEO_DEFAULT_NAMES }

/** Parses the inline data script; null when absent or malformed. */
export function readInitialData(doc: Document = document): InitialData | null {
  const el = doc.getElementById(INITIAL_DATA_ID)
  if (!el?.textContent) return null
  try {
    return JSON.parse(el.textContent) as InitialData
  } catch {
    return null
  }
}

/** Seeds React Query with the inline payloads, under the keys the public pages use. */
export function seedInitialData(queryClient: QueryClient, data: InitialData | null): void {
  if (!data) return
  if (data.seo) seo = { ...seo, ...data.seo }
  if (Array.isArray(data.sites)) queryClient.setQueryData(['sites'], { sites: data.sites })
  if (Array.isArray(data.languages)) queryClient.setQueryData(['languages'], { languages: data.languages })
  if (data.content) queryClient.setQueryData(['content', data.content.site, data.locale], data.content)
  if (data.item) queryClient.setQueryData(['item', data.item.id, data.locale], { item: data.item })
}

/** Organisation names for titles (server config when inline data was present, else defaults). */
export function seoNames(): InitialSeo {
  return seo
}

/** Absolute canonical URL of a path: the server's PUBLIC_BASE_URL, else this origin. */
export function canonicalUrl(path: string): string {
  return `${seo.baseUrl ?? window.location.origin}${path}`
}
