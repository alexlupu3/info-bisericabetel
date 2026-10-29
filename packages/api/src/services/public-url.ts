// PUBLIC_BASE_URL and absoluteUrl() — the single source of absolute URLs
// (canonical, Open Graph, JSON-LD, sitemap, robots.txt, feeds, short-link
// previews). Spec 03 FR-066; consumed by specs 01, 02, 05 and 06.

const DEV_DEFAULT = 'http://localhost:3100'

/**
 * Validates and normalises a PUBLIC_BASE_URL value: http(s) origin (scheme + host
 * [+ port]) with no path, query or fragment. Trailing slashes are stripped.
 * Throws an Error with a readable message when malformed.
 */
export function parsePublicBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`PUBLIC_BASE_URL is not a valid URL: "${raw}"`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`PUBLIC_BASE_URL must use http or https: "${raw}"`)
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error(`PUBLIC_BASE_URL must be an origin without path, query or fragment: "${raw}"`)
  }
  return url.origin
}

/**
 * Resolves the base URL from the environment. In production a missing or malformed
 * value is fatal; elsewhere a missing value falls back to http://localhost:3100.
 */
export function resolvePublicBaseUrl(
  env: { PUBLIC_BASE_URL?: string; NODE_ENV?: string } = process.env,
  warn: (msg: string) => void = msg => console.warn(msg),
): string {
  const raw = env.PUBLIC_BASE_URL?.trim()
  if (!raw) {
    if (env.NODE_ENV === 'production') {
      throw new Error('PUBLIC_BASE_URL environment variable is required in production (e.g. https://info.bisericabetel.com)')
    }
    warn(`PUBLIC_BASE_URL is not set; using ${DEV_DEFAULT} for absolute URLs (development only)`)
    return DEV_DEFAULT
  }
  return parsePublicBaseUrl(raw)
}

let baseUrl: string | null = null

/** Reads and validates PUBLIC_BASE_URL once; call at startup so a bad value fails fast. */
export function initPublicBaseUrl(env?: { PUBLIC_BASE_URL?: string; NODE_ENV?: string }): string {
  baseUrl = resolvePublicBaseUrl(env)
  return baseUrl
}

/** The validated public origin, e.g. "https://info.bisericabetel.com" (no trailing slash). */
export function publicBaseUrl(): string {
  if (baseUrl === null) baseUrl = resolvePublicBaseUrl()
  return baseUrl
}

/**
 * Absolute URL for a root-relative path ("/i/123" → "https://host/i/123"); absolute
 * http(s) URLs pass through unchanged. Throws on anything else (relative paths,
 * protocol-relative "//host", javascript:, data:, ...).
 */
export function absoluteUrl(path: string, base: string = publicBaseUrl()): string {
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')) return `${base}${path}`
  throw new Error(`absoluteUrl: expected a root-relative path or an http(s) URL, got "${path}"`)
}
