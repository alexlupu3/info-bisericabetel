// In-memory cache of rendered public pages and the sitemap (spec 03 §6.3 step 5).
// Keyed by path only — no cookies, locale or user agent, so it holds no visitor data.

import { createHash } from 'crypto'

export interface CachedResponse {
  status: number
  body: string
  etag: string
  contentType: string
  expiresAt: number
}

function ttlMs(): number {
  const raw = process.env.SEO_CACHE_TTL_SECONDS
  const seconds = raw === undefined || raw.trim() === '' ? 60 : Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
}

export function strongEtag(body: string): string {
  return `"${createHash('sha1').update(body).digest('hex')}"`
}

const entries = new Map<string, CachedResponse>()

export const seoCache = {
  /**
   * Returns the cached response for `key`, or renders it with `render()` and caches it
   * for SEO_CACHE_TTL_SECONDS (0 disables caching). At most one render per key per TTL.
   * Only 200 responses are cached, so random unknown URLs cannot grow the map.
   */
  async get(
    key: string,
    render: () => Promise<{ status: number; body: string; contentType: string }>,
  ): Promise<CachedResponse> {
    const now = Date.now()
    const hit = entries.get(key)
    if (hit && hit.expiresAt > now) return hit
    const rendered = await render()
    const entry: CachedResponse = { ...rendered, etag: strongEtag(rendered.body), expiresAt: now + ttlMs() }
    if (ttlMs() > 0 && entry.status === 200) entries.set(key, entry)
    else entries.delete(key)
    return entry
  },
  /** Drops every cached page (called after admin writes). */
  clear(): void {
    entries.clear()
  },
}

/** True when the request's If-None-Match matches `etag` (weak comparison, `*` included). */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false
  const bare = etag.replace(/^W\//, '')
  return ifNoneMatch.split(',').some(t => {
    const v = t.trim()
    return v === '*' || v.replace(/^W\//, '') === bare
  })
}
