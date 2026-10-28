// /llms.txt (spec 02 FR-064(b)): an agent-oriented index of the hub pages, the event
// feeds and the public JSON API, following the llms.txt convention (H1, blockquote
// summary, H2 sections of link lines). Pure and deterministic — generated from the
// `sites` and enabled `languages` rows. English: it targets agents.

import { absoluteUrl } from './public-url.js'

export interface LlmsTxtInput {
  baseUrl: string
  /** Sites ordered by slug (like GET /api/sites). */
  sites: Array<{ slug: string; name: string }>
  /** Enabled languages. */
  languages: Array<{ code: string; isDefault: boolean }>
}

/** Link text inside `[...]`: brackets escaped so a site name cannot break the Markdown link. */
function linkText(text: string): string {
  return text.replace(/[\\[\]]/g, ch => `\\${ch}`).replace(/\s+/g, ' ').trim()
}

export function buildLlmsTxt(input: LlmsTxtInput): string {
  const url = (path: string) => absoluteUrl(path, input.baseUrl)
  const slugPath = (slug: string) => `/${encodeURIComponent(slug)}`
  const languages = [...input.languages].sort((a, b) =>
    a.isDefault === b.isDefault ? a.code.localeCompare(b.code) : a.isDefault ? -1 : 1)
  const codes = languages.map(l => (l.isDefault ? `${l.code} (default)` : l.code)).join(', ')

  return [
    '# Betel Info',
    '',
    '> Information hub of Biserica Betel, a multi-site church: current and upcoming events, announcements and useful links, filtered per site (location). Content is authored in Romanian; translations may exist for the languages listed below.',
    '',
    'Dates are calendar dates in Europe/Bucharest; `startTime`, when present, is local wall-clock time.',
    '',
    '## Current and upcoming events (RSS 2.0)',
    '',
    `- [All sites](${url('/feed.xml')}): every current or upcoming event that is not exclusive to a single site`,
    ...input.sites.map(s =>
      `- [${linkText(s.name)}](${url(`${slugPath(s.slug)}/feed.xml`)}): current and upcoming events for ${s.name.trim()}`),
    '',
    `Add \`?lang=<code>\` for a translation; available codes: ${codes || 'ro (default)'}.`,
    'Items carry `ev:startdate`, `ev:enddate`, `ev:location` and `betel:*` elements with ISO 8601 dates.',
    '',
    '## Hub pages',
    '',
    `- [All sites](${url('/')})`,
    ...input.sites.map(s => `- [${linkText(s.name)}](${url(slugPath(s.slug))})`),
    '',
    '## Public JSON API',
    '',
    `- [Sites](${url('/api/sites')}): \`{ sites: [{ slug, name, accent }] }\``,
    `- [Content](${url('/api/content')}?site=<slug>&locale=<code>): published, non-expired items in display order; \`data.startDate\` / \`data.endDate\` mark events`,
    `- [Languages](${url('/api/languages')}): enabled languages`,
    '',
  ].join('\n')
}
