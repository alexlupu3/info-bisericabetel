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

export interface ShortLink {
  id: string
  code: string
  label: string
  contentItemId: string
  siteSlug: string | null
  createdAt: string
  clickCount: number
}

export interface SqlQueryRequest {
  query: string
  readOnly: boolean
}

export interface SqlQueryColumn {
  name: string
  typeOid: number
}

export interface SqlQueryResult {
  command: string
  columns: SqlQueryColumn[]
  rows: Record<string, unknown>[]
  /** Rows affected or returned; when `truncated`, only the number shown (more exist) */
  rowCount: number
  truncated: boolean
  durationMs: number
}

/**
 * `invalid`  — malformed input caught before reaching the database
 * `blocked`  — rejected by the dangerous-command filter
 * `database` — PostgreSQL refused the statement (syntax, missing table, ...)
 * `read_only`— a write was attempted in read-only mode
 * `timeout`  — the statement exceeded the time limit
 * `unavailable` — the console's database role is not set up
 */
export type SqlQueryErrorKind = 'invalid' | 'blocked' | 'database' | 'read_only' | 'timeout' | 'unavailable'

export interface SqlQueryError {
  error: string
  kind: SqlQueryErrorKind
  /** 1-based character offset into the query, when known */
  position?: number
  line?: number
  column?: number
  hint?: string
  detail?: string
  pgCode?: string
}
