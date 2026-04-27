import type { Site } from '@betel/shared'

export interface ContentItem {
  id: string
  type: 'card' | 'richtext' | 'poster' | 'video'
  state: 'draft' | 'published' | 'archived'
  sites: string[]
  exclusiveSite: string | null
  orderPosition: number
  groupId: string | null
  groupTitle: string | null
  expiresAt: string | null
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const api = {
  sites: () => get<{ sites: Site[] }>('/api/sites'),
  content: (site: string | null, locale?: string) => {
    const params = new URLSearchParams()
    if (site) params.set('site', site)
    if (locale && locale !== 'ro') params.set('locale', locale)
    const qs = params.toString()
    return get<{ site: string | null; items: ContentItem[] }>(
      `/api/content${qs ? `?${qs}` : ''}`
    )
  },
}
