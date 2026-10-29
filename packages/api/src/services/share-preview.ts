// Link previews of short links (spec 06, FR-085/FR-086, ADR-025): link-preview crawlers
// get a small HTML page with Open Graph / Twitter metadata built from the content item
// at `/s/:code`; everybody else keeps the 302 (routes/short-links.ts). Pure: the rows
// are loaded by resolvePreview() in services/short-links.ts.

import type { ShortLinkPreview, ShortLinkPreviewMode } from '@betel/shared'
import { itemSchedule, readLocation, stripMarkdown, truncateText } from '@betel/shared'
import { dateLocaleFor, DEFAULT_LOCALE } from './locale.js'
import type { OgImage } from './og-image.js'
import { absoluteUrl } from './public-url.js'
import { feedWhenText } from './rss.js'
import { escapeHtml } from './seo/escape.js'
import { ogLocale } from './seo/render-head.js'

// --- Detection (§6.1) ------------------------------------------------------

/**
 * User-Agent tokens of link-preview crawlers (case-insensitive substrings). iMessage
 * and Signal are caught through the Meta/WhatsApp tokens they borrow. Search crawlers
 * (Googlebot, Bingbot) are deliberately absent: they keep getting the 302.
 */
export const PREVIEW_CRAWLER_TOKENS: readonly string[] = Object.freeze([
  'facebookexternalhit', 'Facebot', 'WhatsApp', 'Twitterbot', 'TelegramBot', 'Slackbot',
  'Discordbot', 'LinkedInBot', 'Google-PageRenderer', 'Pinterest', 'Applebot',
  'Viber', 'SkypeUriPreview', 'redditbot', 'Embedly', 'Iframely', 'vkShare', 'XING-contenttabreceiver',
])
const CRAWLER_PATTERN = new RegExp(PREVIEW_CRAWLER_TOKENS.map(t => t.replace(/[-]/g, '\\-')).join('|'), 'i')

export function isPreviewCrawler(userAgent: string | undefined): boolean {
  return typeof userAgent === 'string' && CRAWLER_PATTERN.test(userAgent)
}

// --- Language (§6.4) -------------------------------------------------------

const LANG_PARAM = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/

export interface PickedLocale {
  locale: string
  /** The `?lang` value to echo into og:url, or null. */
  langParam: string | null
}

/** `?lang` (enabled) → first enabled `Accept-Language` primary subtag → default. */
export function pickLocale(input: {
  lang?: unknown
  acceptLanguage?: string
  enabled: readonly string[]
  defaultLocale?: string
}): PickedLocale {
  const defaultLocale = input.defaultLocale ?? DEFAULT_LOCALE
  const enabled = new Set(input.enabled)
  if (typeof input.lang === 'string' && LANG_PARAM.test(input.lang) && enabled.has(input.lang)) {
    return { locale: input.lang, langParam: input.lang }
  }
  const ranges = (input.acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map(p => /^\s*q=([0-9.]+)\s*$/.exec(p)?.[1]).find(Boolean)
      return { primary: tag.trim().toLowerCase().split('-')[0], q: q === undefined ? 1 : Number(q), index }
    })
    .filter(r => r.primary && r.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
  const match = ranges.find(r => enabled.has(r.primary))
  return { locale: match?.primary ?? defaultLocale, langParam: null }
}

// --- Metadata (FR-086, §6.3) ----------------------------------------------

const DESCRIPTION_MAX = 200

export interface PreviewInput {
  code: string
  mode: ShortLinkPreviewMode
  /** The content item with locale-merged data (`{ ...data, ...translatedData }`); null when gone. */
  item: { type: string; data: Record<string, unknown> } | null
  /** The link's site (site-scoped link), or null. */
  site: { name: string } | null
  locale: string
  langParam: string | null
  /** BR-012 destination; null when the item has no link. */
  destination: string | null
  /** The hub's share name (og:site_name, spec 03). */
  hubName: string
  /** Derivative of the item's own image (null when it has none), and the brand fallback. */
  itemImage: OgImage | null
  brandImage: OgImage
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Only http(s) URLs and root-relative paths are linked; anything else becomes '/'. */
export function safeDestination(value: string | null): string {
  if (!value) return '/'
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  if (v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\')) return v
  return '/'
}

/** The description chain: authored description → "when · location" → null. */
export function previewDescription(data: Record<string, unknown>, locale: string): string | null {
  const authored = text(data.description)
  if (authored) {
    const plain = stripMarkdown(authored)
    return plain ? truncateText(plain, DESCRIPTION_MAX) : null
  }
  const when = itemSchedule(data).startDate ? feedWhenText(data, dateLocaleFor(locale)) : null
  const fallback = [when, readLocation(data)].filter(Boolean).join(' · ')
  return fallback ? truncateText(fallback, DESCRIPTION_MAX) : null
}

/** Pure assembly of the preview metadata from already-loaded rows (unit-tested). */
export function buildPreview(input: PreviewInput): ShortLinkPreview {
  const siteName = input.site ? `${input.site.name} · ${input.hubName}` : input.hubName
  const item = input.item
  const previewable = item && (item.type === 'card' || item.type === 'poster')
  // Title: data.title (translated, then base — already merged); Posters have none.
  const ownTitle = previewable && item.type === 'card' ? text(item.data.title) : null
  const ownImage = previewable ? input.itemImage : null
  const image = ownImage ?? input.brandImage

  let reason: ShortLinkPreview['reason'] = null
  if (input.mode === 'destination') reason = 'mode-destination'
  else if (!item) reason = 'item-missing'
  else if (!ownTitle && !ownImage) reason = 'no-title-no-image'

  const query = input.langParam ? `?lang=${encodeURIComponent(input.langParam)}` : ''
  return {
    mode: input.mode,
    willPreview: reason === null,
    reason,
    locale: input.locale,
    siteName,
    title: ownTitle ?? siteName,
    description: previewable ? previewDescription(item.data, input.locale) : null,
    imageUrl: absoluteUrl(`/uploads/og/${image.name}`),
    imageWidth: image.width,
    imageHeight: image.height,
    url: absoluteUrl(`/s/${input.code}${query}`),
    destination: safeDestination(input.destination),
  }
}

function meta(attr: 'name' | 'property', key: string, content: string | number | null): string | null {
  if (content === null || content === '') return null
  return `<meta ${attr}="${key}" content="${escapeHtml(content)}">`
}

/** The preview page (§6.6): metadata only, one visible link, no redirect, no script. */
export function renderPreviewHtml(preview: ShortLinkPreview): string {
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${escapeHtml(preview.title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(preview.url)}">`,
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', preview.siteName),
    meta('property', 'og:locale', ogLocale(preview.locale)),
    meta('property', 'og:url', preview.url),
    meta('property', 'og:title', preview.title),
    meta('property', 'og:description', preview.description),
    meta('property', 'og:image', preview.imageUrl),
    meta('property', 'og:image:secure_url', preview.imageUrl),
    meta('property', 'og:image:type', 'image/jpeg'),
    meta('property', 'og:image:width', preview.imageWidth),
    meta('property', 'og:image:height', preview.imageHeight),
    meta('property', 'og:image:alt', preview.title),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', preview.title),
    meta('name', 'twitter:description', preview.description),
    meta('name', 'twitter:image', preview.imageUrl),
  ].filter((tag): tag is string => tag !== null)

  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(preview.locale)}">`,
    '<head>',
    ...head,
    '</head>',
    '<body>',
    `<p><a href="${escapeHtml(preview.destination)}" rel="noopener">${escapeHtml(preview.title)}</a></p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
