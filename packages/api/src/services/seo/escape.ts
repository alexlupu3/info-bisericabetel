// Escaping for server-rendered HTML (ADR-022). Database text is never emitted raw.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escapes text for HTML element content and double- or single-quoted attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch])
}

/**
 * JSON for embedding inside a <script> element (JSON-LD, inline data): `<`, `>`, `&`
 * and U+2028/U+2029 are written as \u escapes, so database text can never close the
 * element or break a JavaScript parser. The result is still valid JSON.
 */
export function serializeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Escapes text for XML element content and attributes, dropping characters invalid in XML 1.0. */
export function escapeXml(value: unknown): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/[&<>"']/g, ch => (ch === "'" ? '&apos;' : HTML_ESCAPES[ch]))
}

/** Only http(s) and root-relative URLs are emitted as href/src; anything else becomes null. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  if (v.startsWith('/') && !v.startsWith('//')) return v
  if (/^(mailto|tel):/i.test(v)) return v
  return null
}
