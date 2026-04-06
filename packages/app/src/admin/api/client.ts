const TOKEN_KEY = 'betel-admin-token'

export function getToken() { return sessionStorage.getItem(TOKEN_KEY) }
export function setToken(t: string) { sessionStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { sessionStorage.removeItem(TOKEN_KEY) }

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
  orderPosition: number; groupId: string | null
  expiresAt: string | null; data: Record<string, unknown>
  createdAt: string; updatedAt: string
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

export interface LifetimeAnalytics {
  total: { visits: number; clicks: number }
  bySite: Array<{ slug: string | null; visits: number; clicks: number }>
}

export interface DailyAnalytics {
  daily: Array<{ date: string; visits: number; clicks: number }>
  days: number
}

export interface ItemAnalytics {
  items: Array<{ itemId: string | null; type: string; title: string; clicks: number }>
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
  },
  groups: {
    list:    () => get<{ groups: Group[] }>('/api/admin/groups'),
    create:  (title: string, sites?: string[]) =>
      post<Group>('/api/admin/groups', { title, sites }),
    update:  (id: string, body: { title?: string; sites?: string[] }) =>
      patch<Group>(`/api/admin/groups/${id}`, body),
    reorder: (order: string[]) => put<{ ok: boolean }>('/api/admin/groups/order', { order }),
    remove:  (id: string) => del<void>(`/api/admin/groups/${id}`),
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
  analytics: {
    lifetime: () => get<LifetimeAnalytics>('/api/admin/analytics/lifetime'),
    daily:    (days = 30) => get<DailyAnalytics>(`/api/admin/analytics/daily?days=${days}`),
    items:    () => get<ItemAnalytics>('/api/admin/analytics/items'),
  },
}
