export interface Site {
  slug: string
  name: string
  accent: string
}

export type ContentType = 'card' | 'richtext' | 'poster' | 'video'
export type PublishState = 'draft' | 'published' | 'archived'

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
