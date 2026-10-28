// The SPA's built index.html as a template for server-rendered pages (ADR-022).
// Split once at startup at three anchors that Vite always emits — no special
// markers in index.html. A missing anchor fails startup loudly.

import { readFileSync, existsSync } from 'fs'
import { escapeHtml, serializeJsonForScript } from './escape.js'

const TITLE_RE = /<title>[\s\S]*?<\/title>/
const HTML_LANG_RE = /<html\b[^>]*?\blang="[^"]*"[^>]*>/
const HEAD_END = '</head>'
const ROOT_EMPTY = '<div id="root"></div>'

export const INITIAL_DATA_ID = 'betel-initial-data'

export interface PageTemplate {
  render(parts: { lang: string; title: string; headTags: string; snapshot: string; initialData: unknown }): string
  /** The template unchanged (for SPA fallback paths such as /admin/*). */
  raw: string
}

/** Builds a template from index.html source; throws when an anchor is missing. */
export function parseTemplate(html: string): PageTemplate {
  const missing: string[] = []
  if (!TITLE_RE.test(html)) missing.push('<title>…</title>')
  if (!HTML_LANG_RE.test(html)) missing.push('<html lang="…">')
  if (!html.includes(HEAD_END)) missing.push(HEAD_END)
  if (!html.includes(ROOT_EMPTY)) missing.push(ROOT_EMPTY)
  if (missing.length > 0) {
    throw new Error(`index.html template is missing anchor(s): ${missing.join(', ')} — server-side head injection (ADR-022) cannot work`)
  }

  return {
    raw: html,
    render({ lang, title, headTags, snapshot, initialData }) {
      return html
        .replace(HTML_LANG_RE, tag => tag.replace(/\blang="[^"]*"/, `lang="${escapeHtml(lang)}"`))
        .replace(TITLE_RE, () => `<title>${escapeHtml(title)}</title>`)
        .replace(HEAD_END, () => `\n    ${headTags}\n  ${HEAD_END}`)
        .replace(ROOT_EMPTY, () =>
          `<div id="root">${snapshot}</div>\n    <script id="${INITIAL_DATA_ID}" type="application/json">${serializeJsonForScript(initialData)}</script>`)
    },
  }
}

/** Loads index.html from the SPA build; null (with a warning) when the app has not been built. */
export function loadTemplate(indexPath: string, warn: (msg: string) => void = m => console.warn(m)): PageTemplate | null {
  if (!existsSync(indexPath)) {
    warn(`${indexPath} not found — server-rendered pages are disabled (build the app with \`pnpm build\`)`)
    return null
  }
  return parseTemplate(readFileSync(indexPath, 'utf8'))
}
