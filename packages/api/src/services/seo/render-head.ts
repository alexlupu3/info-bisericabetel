// Server-rendered <head> metadata for public pages (spec 03 FR-067, §6.4).
// Pure: PageModel → title text + HTML tags inserted before </head>.

import {
  UI_DEFAULTS,
  hubDescription,
  itemDateLine,
  itemDisplayTitle,
  itemPlainText,
  pageTitle,
  siteDescription,
  truncateText,
  type SeoPage,
} from '@betel/shared'
import { absoluteUrl } from '../public-url.js'
import { escapeHtml, serializeJsonForScript } from './escape.js'
import { collectHeadTags } from './head-tags.js'
import { DEFAULT_LOGO_PATH, DEFAULT_LOGO_SIZE } from './organization.js'
import type { PageModel } from './page-model.js'
import { buildStructuredData } from './structured-data.js'
import { itemImagePath } from './item-image.js'

const DESCRIPTION_MAX = 300

const OG_LOCALES: Record<string, string> = { ro: 'ro_RO', en: 'en_US', de: 'de_DE', hu: 'hu_HU' }

/** Open Graph locale (ro → ro_RO), mapped as LanguageContext maps date locales; null when unknown. */
export function ogLocale(code: string): string | null {
  if (OG_LOCALES[code]) return OG_LOCALES[code]
  return /^[a-z]{2}[-_][A-Z]{2}$/.test(code) ? code.replace('-', '_') : null
}

export function seoPageOf(model: PageModel): SeoPage {
  switch (model.kind) {
    case 'hub': return { kind: 'hub' }
    case 'site': return { kind: 'site', siteName: model.site?.name ?? '' }
    case 'item': return {
      kind: 'item',
      title: model.item ? itemDisplayTitle(model.item) : null,
      siteName: model.site?.name ?? null,
    }
    default: return { kind: 'not-found', message: UI_DEFAULTS['item.notFound'] }
  }
}

export function pageDescription(model: PageModel): string {
  const subtitle = UI_DEFAULTS['hero.subtitle']
  switch (model.kind) {
    case 'hub':
      return hubDescription(subtitle, model.sites.map(s => s.name))
    case 'site':
      return model.site ? siteDescription(subtitle, model.site) : subtitle
    case 'item': {
      const item = model.item
      if (!item) return subtitle
      const text = itemPlainText(item)
      if (text) return truncateText(text, DESCRIPTION_MAX)
      const fallback = [itemDateLine(item.data), model.site?.name].filter(Boolean).join(' · ')
      return fallback || itemDisplayTitle(item) || subtitle
    }
    default:
      return UI_DEFAULTS['item.notFound']
  }
}

function meta(attr: 'name' | 'property', key: string, content: string | number | null | undefined): string | null {
  if (content === null || content === undefined || content === '') return null
  return `<meta ${attr}="${key}" content="${escapeHtml(content)}">`
}

export interface RenderedHead {
  /** Text of the <title> element (unescaped). */
  title: string
  /** HTML inserted before </head>. */
  tags: string
}

export function renderHead(model: PageModel): RenderedHead {
  const { config, baseUrl } = model
  const title = pageTitle(seoPageOf(model), config)
  const description = pageDescription(model)
  const indexable = model.kind === 'hub' || model.kind === 'site' || model.kind === 'item'
  const canonical = indexable ? absoluteUrl(model.path, baseUrl) : null

  const ownImage = model.kind === 'item' && model.item ? itemImagePath(model.item) : null
  const image = absoluteUrl(ownImage ?? config.orgLogoPath, baseUrl)
  const knownLogoSize = !ownImage && config.orgLogoPath === DEFAULT_LOGO_PATH ? DEFAULT_LOGO_SIZE : null

  const tags: Array<string | null> = [
    meta('name', 'description', description),
    indexable ? null : '<meta name="robots" content="noindex">',
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : null,
    model.kind === 'hub' && config.googleSiteVerification
      ? meta('name', 'google-site-verification', config.googleSiteVerification)
      : null,
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    canonical ? meta('property', 'og:url', canonical) : null,
    meta('property', 'og:type', model.kind === 'item' ? 'article' : 'website'),
    meta('property', 'og:site_name', config.orgName),
    meta('property', 'og:image', image),
    meta('property', 'og:image:width', knownLogoSize),
    meta('property', 'og:image:height', knownLogoSize),
    meta('property', 'og:locale', ogLocale(model.lang)),
    meta('name', 'twitter:card', ownImage ? 'summary_large_image' : 'summary'),
  ]

  const jsonLd = buildStructuredData(model)
  if (jsonLd) tags.push(`<script type="application/ld+json">${serializeJsonForScript(jsonLd)}</script>`)

  tags.push(...collectHeadTags(model))

  return { title, tags: tags.filter((t): t is string => !!t).join('\n    ') }
}
