const TOKEN_KEY = 'betel-admin-token'

export function getToken() { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return undefined as T
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), { status: res.status })
  return data
}

const get  = <T>(p: string)           => request<T>('GET',    p)
const post = <T>(p: string, b: unknown) => request<T>('POST',   p, b)
const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b)
const put  = <T>(p: string, b: unknown) => request<T>('PUT',    p, b)
const del  = <T>(p: string)           => request<T>('DELETE', p)

async function downloadFile(path: string, filename: string) {
  const token = getToken()
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Export eșuat')
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href; a.download = filename; a.click()
  URL.revokeObjectURL(href)
}

export interface User {
  id: string; email: string; role: string; mustChangePassword: boolean
}

export interface Site {
  slug: string; name: string; accent: string; address?: string | null
}

export interface Group {
  id: string; title: string; sites: string[]
  orderPosition: number; state: string
  createdAt: string; updatedAt: string
}

export interface ContentItem {
  id: string; type: string; state: string; sites: string[]
  exclusiveSite: string | null
  orderPosition: number; groupId: string | null
  expiresAt: string | null; data: Record<string, unknown>
  createdAt: string; updatedAt: string
}

export interface Language {
  code: string; name: string; enabled: boolean; isDefault: boolean
  createdAt: string
}

export interface MediaUsedBy {
  id: string; type: string; name: string
}

export interface MediaItem {
  id: string; url: string; filename: string
  originalName: string; size: number; mimeType: string
  createdAt: string; usedBy: MediaUsedBy[]
}

export interface AuditLogEntry {
  id: string; userId: string | null; userEmail: string
  action: string; entityType: string; entityId: string | null
  detail: Record<string, unknown>; createdAt: string
}

export interface TranslationKey {
  key: string; values: Record<string, string>
}

export interface ContentTranslation {
  id: string; contentItemId: string; locale: string
  data: Record<string, unknown>
  createdAt: string; updatedAt: string
}

export interface LifetimeAnalytics {
  total: { visits: number; clicks: number }
  bySite: Array<{ slug: string | null; visits: number; clicks: number }>
}

export interface DailyAnalytics {
  daily: Array<{ date: string; visits: number; clicks: number }>
  days: number
}

export interface ItemAnalytics {
  items: Array<{
    itemId: string | null
    type: string
    title: string
    clicks: number
    websiteClicks: number
    shortLinkClicks: number
  }>
}

export interface ShortLink {
  id: string
  code: string
  label: string
  contentItemId: string
  siteSlug: string | null
  createdAt: string
  clickCount: number
}

export type Period = 'day' | 'week' | 'month' | 'custom'

export interface ClickBreakdownItem {
  itemId: string | null
  title: string
  clicks: number
}

export interface OverviewSeries {
  label: string
  views: number
  clicks: number
  clickBreakdown?: ClickBreakdownItem[]
  otherClicks?: number
}

export interface OverviewData {
  period: Period
  current: { views: number; clicks: number; series: OverviewSeries[] }
  previous: { views: number; clicks: number; series: OverviewSeries[] }
  viewsChange: number
  clicksChange: number
}

export interface ItemDailyShortLink {
  id: string
  label: string
}

export interface ItemDaily {
  itemId: string
  daily: Array<{ date: string; website: number; [shortLinkId: string]: number | string }>
  shortLinks: ItemDailyShortLink[]
}

export interface SiteComparisonPoint {
  label: string
  sites: Record<string, { views: number; clicks: number }>
  total: { views: number; clicks: number }
}

export interface SiteComparisonData {
  period: Period
  sites: Array<{ slug: string; name: string; accent: string }>
  series: SiteComparisonPoint[]
}

export const api = {
  auth: {
    login:          (email: string, password: string) =>
      post<{ token: string; user: User }>('/api/auth/login', { email, password }),
    me:             () => get<User>('/api/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) =>
      post<{ ok: boolean }>('/api/auth/change-password', { currentPassword, newPassword }),
  },
  content: {
    list:    () => get<{ items: ContentItem[] }>('/api/admin/content'),
    get:     (id: string) => get<ContentItem>(`/api/admin/content/${id}`),
    create:  (body: Partial<ContentItem>) => post<ContentItem>('/api/admin/content', body),
    update:  (id: string, body: Partial<ContentItem & { state: string }>) =>
      patch<ContentItem>(`/api/admin/content/${id}`, body),
    remove:  (id: string) => del<void>(`/api/admin/content/${id}`),
    reorder:     (order: string[]) =>
      put<{ items: ContentItem[] }>('/api/admin/content/order', { order }),
    reorderRoot: (order: Array<{ id: string; kind: 'item' | 'group' }>) =>
      put<{ items: ContentItem[]; groups: Group[] }>('/api/admin/content/root-order', { order }),
    publish: (id: string) => post<ContentItem>(`/api/admin/content/${id}/publish`, {}),
    archive: (id: string) => post<ContentItem>(`/api/admin/content/${id}/archive`, {}),
    listDeleted: () => get<{ items: ContentItem[] }>('/api/admin/content/deleted'),
    duplicate: (id: string) => post<ContentItem>(`/api/admin/content/${id}/duplicate`, {}),
    restore: (id: string) => post<ContentItem>(`/api/admin/content/${id}/restore`, {}),
    removePermanent: (id: string) => del<void>(`/api/admin/content/${id}/permanent`),
    listTranslations: (id: string) =>
      get<{ translations: ContentTranslation[] }>(`/api/admin/content/${id}/translations`),
    upsertTranslation: (id: string, locale: string, data: Record<string, unknown>) =>
      put<ContentTranslation>(`/api/admin/content/${id}/translations/${locale}`, { data }),
    removeTranslation: (id: string, locale: string) =>
      del<void>(`/api/admin/content/${id}/translations/${locale}`),
  },
  groups: {
    list:    () => get<{ groups: Group[] }>('/api/admin/groups'),
    create:  (title: string, sites?: string[]) =>
      post<Group>('/api/admin/groups', { title, sites }),
    update:  (id: string, body: { title?: string; sites?: string[] }) =>
      patch<Group>(`/api/admin/groups/${id}`, body),
    reorder: (order: string[]) => put<{ ok: boolean }>('/api/admin/groups/order', { order }),
    remove:  (id: string) => del<void>(`/api/admin/groups/${id}`),
    upsertTranslation: (id: string, locale: string, title: string) =>
      put<unknown>(`/api/admin/groups/${id}/translations/${locale}`, { title }),
    removeTranslation: (id: string, locale: string) =>
      del<void>(`/api/admin/groups/${id}/translations/${locale}`),
  },
  sites: {
    list:   () => get<{ sites: Site[] }>('/api/sites'),
    update: (slug: string, body: { name?: string; accent?: string; address?: string }) =>
      patch<Site>(`/api/admin/sites/${slug}`, body),
  },
  users: {
    list:   () => get<{ users: User[] }>('/api/admin/users'),
    create: (email: string, role?: string) =>
      post<User & { tempPassword: string }>('/api/admin/users', { email, role }),
    resetPassword: (id: string) =>
      post<{ tempPassword: string }>(`/api/admin/users/${id}/reset-password`, {}),
    remove: (id: string) => del<void>(`/api/admin/users/${id}`),
  },
  media: {
    list:   () => get<{ media: MediaItem[] }>('/api/admin/media'),
    remove: (id: string) => del<void>(`/api/admin/media/${id}`),
  },
  logs: {
    list: (limit = 100, offset = 0) =>
      get<{ logs: AuditLogEntry[]; limit: number; offset: number }>(
        `/api/admin/logs?limit=${limit}&offset=${offset}`
      ),
  },
  shortLinks: {
    list:   (contentItemId: string) =>
      get<{ shortLinks: ShortLink[] }>(`/api/admin/content/${contentItemId}/short-links`),
    create: (contentItemId: string, label: string, siteSlug?: string | null) =>
      post<ShortLink>(`/api/admin/content/${contentItemId}/short-links`, { label, siteSlug }),
    remove: (contentItemId: string, shortLinkId: string) =>
      del<void>(`/api/admin/content/${contentItemId}/short-links/${shortLinkId}`),
  },
  analytics: {
    lifetime: () => get<LifetimeAnalytics>('/api/admin/analytics/lifetime'),
    daily:    (days = 30) => get<DailyAnalytics>(`/api/admin/analytics/daily?days=${days}`),
    items:    (site?: string) =>
      get<ItemAnalytics>(`/api/admin/analytics/items${site ? `?site=${site}` : ''}`),
    overview: (period: Period = 'week', site?: string, startDate?: string) =>
      get<OverviewData>(`/api/admin/analytics/overview?period=${period}${site ? `&site=${site}` : ''}${startDate ? `&startDate=${startDate}` : ''}`),
    itemDaily: (itemId: string, site?: string) =>
      get<ItemDaily>(`/api/admin/analytics/items/${itemId}/daily${site ? `?site=${site}` : ''}`),
    sitesComparison: (period: Period, startDate?: string) =>
      get<SiteComparisonData>(`/api/admin/analytics/sites-comparison?period=${period}${startDate ? `&startDate=${startDate}` : ''}`),
    exportItemClicks: (itemId: string, title: string, site?: string) => {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
      const date = new Date().toISOString().slice(0, 10)
      const params = site ? `?site=${encodeURIComponent(site)}` : ''
      return downloadFile(
        `/api/admin/analytics/items/${encodeURIComponent(itemId)}/export${params}`,
        `clickuri-${slug}-${date}.csv`
      )
    },
  },
  languages: {
    list:   () => get<{ languages: Language[] }>('/api/admin/languages'),
    create: (code: string, name: string) =>
      post<Language>('/api/admin/languages', { code, name }),
    update: (code: string, body: { name?: string; enabled?: boolean }) =>
      patch<Language>(`/api/admin/languages/${code}`, body),
    remove: (code: string) => del<void>(`/api/admin/languages/${code}`),
  },
  translations: {
    list:     () => get<{ keys: TranslationKey[] }>('/api/admin/translations'),
    bulkSave: (translations: Array<{ locale: string; key: string; value: string }>) =>
      put<{ ok: boolean }>('/api/admin/translations', { translations }),
    generate: (keys: Record<string, string>) =>
      post<{ generated: number }>('/api/admin/translations/generate', { keys }),
  },
}
