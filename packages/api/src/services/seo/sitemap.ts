// sitemap.xml builder (spec 03 FR-071). Pure: no database access.

import { absoluteUrl } from '../public-url.js'
import { escapeXml } from './escape.js'

type SitemapItem = { id: string; updatedAt: Date | string }

export interface SitemapEntry { path: string; lastmod: string | null }

function isoDay(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10)
}

function newest(items: Array<{ updatedAt: Date | string }>): string | null {
  let max: string | null = null
  for (const it of items) {
    const day = isoDay(it.updatedAt)
    if (!max || day > max) max = day
  }
  return max
}

/** Pure: sitemap entries from the all-sites list and each site's list. */
export function sitemapEntries(
  allItems: SitemapItem[],
  siteLists: Array<{ slug: string; items: SitemapItem[] }>,
): SitemapEntry[] {
  const entries: SitemapEntry[] = [{ path: '/', lastmod: newest(allItems) }]
  for (const s of siteLists) entries.push({ path: `/${s.slug}`, lastmod: newest(s.items) })
  const seen = new Map<string, string>()
  for (const it of [...allItems, ...siteLists.flatMap(s => s.items)]) {
    if (!seen.has(it.id)) seen.set(it.id, isoDay(it.updatedAt))
  }
  for (const [id, lastmod] of seen) entries.push({ path: `/i/${id}`, lastmod })
  return entries
}

export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map(e =>
    `  <url><loc>${escapeXml(absoluteUrl(e.path))}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}
