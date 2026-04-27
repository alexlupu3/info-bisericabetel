export interface Site {
  slug: string
  name: string
  accent: string
}

export type ContentType = 'card' | 'richtext' | 'poster' | 'video'
export type PublishState = 'draft' | 'published' | 'archived' | 'deleted'

export interface ContentItem {
  id: string
  type: ContentType
  state: PublishState
  sites: string[] | null  // null = all sites
  order: number
  groupId: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}

export interface ApiHealth {
  status: 'ok'
  version: string
  timestamp: string
}

export interface Language {
  code: string
  name: string
  isDefault: boolean
  enabled: boolean
}

export interface UiTranslation {
  locale: string
  key: string
  value: string
}

export interface ContentTranslation {
  id: string
  contentItemId: string
  locale: string
  data: Record<string, unknown>
}

export interface GroupTranslation {
  id: string
  groupId: string
  locale: string
  title: string
}
