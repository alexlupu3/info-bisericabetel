// SEO text rules shared by the API's server-rendered head (ADR-022) and the SPA,
// so `<title>` is computed by one function on both sides (spec 03 §6.4).
// Pure; depends on `Intl` only (through event-time.ts).

import { eventStartIso, formatEventWhen, isSingleDayEvent, type EventSchedule } from './event-time.js'

/** Organisation identity used in titles. The API reads it from SEO_* env vars. */
export interface SeoNames {
  /** `SEO_SITE_NAME` — the hub's own name (WebSite.name). */
  siteName: string
  /** `SEO_ORG_NAME` — the church organisation (Organization.name, og:site_name). */
  orgName: string
}

export const SEO_DEFAULT_NAMES: SeoNames = {
  siteName: 'Betel Info',
  orgName: 'Biserica Baptistă Betel',
}

/** The address-related columns of a `sites` row (all optional; structured ones from T8). */
export interface SiteAddressFields {
  address?: string | null
  streetAddress?: string | null
  postalCode?: string | null
  addressLocality?: string | null
  addressRegion?: string | null
  addressCountry?: string | null
}

export type SeoPage =
  | { kind: 'hub' }
  | { kind: 'site'; siteName: string }
  | { kind: 'item'; title: string | null; siteName: string | null }
  | { kind: 'not-found'; message: string }

const TITLE_SEPARATOR = ' – '

/** `<title>` for a public page (spec 03 §6.4). */
export function pageTitle(page: SeoPage, names: SeoNames = SEO_DEFAULT_NAMES): string {
  switch (page.kind) {
    case 'hub':
      return `${names.siteName}${TITLE_SEPARATOR}${names.orgName}`
    case 'site':
      return `${page.siteName}${TITLE_SEPARATOR}${names.orgName}`
    case 'item': {
      const context = page.siteName ?? names.orgName
      return page.title ? `${page.title}${TITLE_SEPARATOR}${context}` : `${names.siteName}${TITLE_SEPARATOR}${context}`
    }
    case 'not-found':
      return `${page.message.trim().replace(/[.!…]+$/, '')}${TITLE_SEPARATOR}${names.siteName}`
  }
}

function sentence(text: string): string {
  const t = text.trim()
  if (!t) return ''
  return /[.!?…]$/.test(t) ? t : `${t}.`
}

/** Description of `/`: the hero subtitle followed by the list of site names. */
export function hubDescription(heroSubtitle: string, siteNames: string[]): string {
  const parts = [sentence(heroSubtitle)]
  if (siteNames.length > 0) parts.push(`Locații: ${siteNames.join(', ')}.`)
  return parts.filter(Boolean).join(' ')
}

/** Description of `/:siteSlug`: the hero subtitle, the site name and its address when set. */
export function siteDescription(heroSubtitle: string, site: { name: string } & SiteAddressFields): string {
  const address = siteAddressLine(site)
  return [sentence(heroSubtitle), `Locația ${site.name}${address ? `, ${address}` : ''}.`]
    .filter(Boolean)
    .join(' ')
}

/**
 * Human-readable address line of a site. Structured fields (migration
 * 0013_site_address_fields) win when present: "street, postal code locality";
 * otherwise the free-text `address`. Null when the site has neither.
 */
export function siteAddressLine(site: SiteAddressFields): string | null {
  const street = site.streetAddress?.trim() || ''
  const locality = [site.postalCode?.trim(), site.addressLocality?.trim()].filter(Boolean).join(' ')
  if (street || locality) return [street, locality].filter(Boolean).join(', ')
  return site.address?.trim() || null
}

/**
 * The site an item belongs to on its own page (`/i/:itemId`, spec 03 §6.2.3): its
 * exclusive site, else the single entry of its `sites[]` surfacing hint, else null.
 */
export function itemSiteSlug(item: { exclusiveSite?: string | null; sites?: string[] | null }): string | null {
  if (item.exclusiveSite) return item.exclusiveSite
  return item.sites && item.sites.length === 1 ? item.sites[0] : null
}

/** Title shown for an item: Card/Richtext/Video `title`, Poster `alt`; null when none. */
export function itemDisplayTitle(item: { type: string; data: Record<string, unknown> }): string | null {
  const d = item.data
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  switch (item.type) {
    case 'poster':
      return pick(d.alt)
    default:
      return pick(d.title)
  }
}

/** Main text of an item (Card `description`, Richtext `body`), Markdown stripped; '' when none. */
export function itemPlainText(item: { type: string; data: Record<string, unknown> }): string {
  const d = item.data
  const raw = item.type === 'richtext' ? d.body : d.description
  return typeof raw === 'string' ? stripMarkdown(raw) : ''
}

/** The item's event schedule (`startDate` with the legacy `date` fallback, `endDate`, `startTime`). */
export function itemSchedule(data: Record<string, unknown>): EventSchedule {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  return {
    startDate: str(data.startDate) ?? str(data.date),
    endDate: str(data.endDate),
    startTime: str(data.startTime),
  }
}

/** "14 noiembrie · 18:00" style date line, or null when the item has no start date. */
export function itemDateLine(data: Record<string, unknown>, dateLocale = 'ro-RO'): string | null {
  return formatEventWhen(itemSchedule(data), dateLocale)
}

/**
 * The date line of an item as the public card renders it: the localised "when" text and,
 * for a single-day event, the ISO value for `<time dateTime>` (spec 04). Multi-day ranges
 * carry no dateTime. Null when the item has no start date. Never throws.
 */
export function itemWhen(data: Record<string, unknown>, dateLocale = 'ro-RO'): { text: string; dateTime: string | null } | null {
  const schedule = itemSchedule(data)
  const text = formatEventWhen(schedule, dateLocale)
  if (!text) return null
  let dateTime: string | null = null
  if (isSingleDayEvent(schedule)) {
    try {
      dateTime = eventStartIso(schedule.startDate!, schedule.startTime)
    } catch {
      dateTime = null
    }
  }
  return { text, dateTime }
}

/** Markdown → plain text: headings, emphasis, links and images to text; whitespace collapsed. */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, ' ')
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([^\n]*?\S)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Truncates on a word boundary, appending "…"; returns the text unchanged when it fits. */
export function truncateText(text: string, max = 300): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`
}

/** User agents treated as crawlers (excluded from `site_visit` analytics, FR-074). */
export const BOT_USER_AGENT_PATTERN = /bot|crawl|spider|slurp|googlebot|bingbot|gptbot|claudebot|perplexitybot/i
