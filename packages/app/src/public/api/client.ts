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

export class HttpError extends Error {
  constructor(public status: number, statusText: string) {
    super(`${status} ${statusText}`)
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new HttpError(res.status, res.statusText)
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
  /** One item visible on the public hub; rejects with HttpError 404/410 otherwise. */
  item: (id: string, locale?: string) => {
    const qs = locale && locale !== 'ro' ? `?locale=${encodeURIComponent(locale)}` : ''
    return get<{ item: ContentItem }>(`/api/content/${encodeURIComponent(id)}${qs}`)
  },
}
