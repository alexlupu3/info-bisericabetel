// schema.org JSON-LD for the public pages (spec 03 §6.5, FR-068/FR-069, BR-030).
// Pure: PageModel → JSON-LD object. Only entities rendered in the page's snapshot
// are emitted (§6.2.3 "Nothing hidden is marked up").

import {
  eventStartIso,
  isClockTime,
  isSingleDayEvent,
  itemDisplayTitle,
  itemPlainText,
  readLocation,
  type EventSchedule,
} from '@betel/shared'
import { absoluteUrl } from '../public-url.js'
import type { EventEntry, FeedItem, PageModel, PublicSite } from './page-model.js'
import { itemImagePath } from './item-image.js'

type Node = Record<string, unknown>

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Removes null/undefined/'' properties so no empty value is ever emitted. */
function compact<T extends Node>(node: T): T {
  for (const key of Object.keys(node)) {
    const v = node[key]
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete node[key]
  }
  return node
}

export function organizationId(base: string): string { return `${base}/#organization` }
export function websiteId(base: string): string { return `${base}/#website` }
export function churchId(base: string, slug: string): string { return `${base}/${slug}#place` }
export function itemUrl(base: string, id: string): string { return `${base}/i/${id}` }

export function postalAddress(site: PublicSite, defaultCountry: string): Node {
  const trim = (v: string | null | undefined) => v?.trim() || null
  return compact({
    '@type': 'PostalAddress',
    streetAddress: trim(site.streetAddress) ?? trim(site.address),
    postalCode: trim(site.postalCode),
    addressLocality: trim(site.addressLocality),
    addressRegion: trim(site.addressRegion),
    addressCountry: trim(site.addressCountry)?.toUpperCase() ?? defaultCountry,
  })
}

/** True when the site has coordinates; the snapshot then renders a map link carrying them. */
export function hasGeo(site: PublicSite): boolean {
  return typeof site.latitude === 'number' && typeof site.longitude === 'number'
    && Number.isFinite(site.latitude) && Number.isFinite(site.longitude)
}

export function churchNode(model: PageModel, site: PublicSite): Node {
  const base = model.baseUrl
  return compact({
    '@type': 'Church',
    '@id': churchId(base, site.slug),
    name: `${model.config.orgName} ${site.name}`,
    url: `${base}/${site.slug}`,
    address: postalAddress(site, model.config.defaultCountry),
    // geo and telephone only when the snapshot renders them (map link / tel: link).
    geo: hasGeo(site)
      ? { '@type': 'GeoCoordinates', latitude: site.latitude, longitude: site.longitude }
      : null,
    telephone: site.telephone?.trim() || null,
    parentOrganization: { '@id': organizationId(base) },
  })
}

function organizationNode(model: PageModel): Node {
  const { config, baseUrl } = model
  return compact({
    '@type': 'Organization',
    '@id': organizationId(baseUrl),
    name: config.orgName,
    url: config.orgWebsite,
    logo: absoluteUrl(config.orgLogoPath, baseUrl),
    sameAs: [config.orgWebsite, ...config.orgSameAs.filter(u => u !== config.orgWebsite)],
    location: model.sites.map(s => ({ '@id': churchId(baseUrl, s.slug) })),
  })
}

function websiteNode(model: PageModel): Node {
  const { config, baseUrl } = model
  return compact({
    '@type': 'WebSite',
    '@id': websiteId(baseUrl),
    url: `${baseUrl}/`,
    name: config.siteName,
    alternateName: config.siteAlternateNames,
    inLanguage: model.lang,
    publisher: { '@id': organizationId(baseUrl) },
  })
}

/** Absolute image for an item: its own picture (field rule (a), spec 06) or the organisation logo. */
export function itemImageUrl(model: PageModel, item: FeedItem): string {
  const own = itemImagePath(item)
  return absoluteUrl(own ?? model.config.orgLogoPath, model.baseUrl)
}

/** ISO start of an event: date-time with the Bucharest offset when startTime is set (spec 04). */
export function eventStartDate(data: Record<string, unknown>): string | null {
  const startDate = typeof data.startDate === 'string' && CALENDAR_DAY.test(data.startDate) ? data.startDate : null
  if (!startDate) return null
  const endDate = typeof data.endDate === 'string' ? data.endDate : null
  const schedule: EventSchedule = { startDate, endDate, startTime: isClockTime(data.startTime) ? data.startTime : null }
  try {
    return eventStartIso(startDate, isSingleDayEvent(schedule) ? schedule.startTime : null)
  } catch {
    return null
  }
}

export function eventNode(model: PageModel, entry: EventEntry): Node | null {
  const { item, site } = entry
  const base = model.baseUrl
  const startDate = eventStartDate(item.data)
  const name = itemDisplayTitle(item)
  if (!startDate || !name) return null
  const endDate = typeof item.data.endDate === 'string' && CALENDAR_DAY.test(item.data.endDate)
    ? item.data.endDate
    : null
  const url = itemUrl(base, item.id)
  return compact({
    '@type': 'Event',
    '@id': `${url}#event`,
    name,
    startDate,
    endDate,
    description: itemPlainText(item) || null,
    image: [itemImageUrl(model, item)],
    url,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    organizer: { '@type': 'Organization', '@id': organizationId(base), name: model.config.orgName, url: model.config.orgWebsite },
    location: {
      '@type': 'Place',
      name: readLocation(item.data) ?? site.name,
      address: postalAddress(site, model.config.defaultCountry),
      containedInPlace: { '@id': churchId(base, site.slug) },
    },
  })
}

/** ItemList for the EEA events carousel: only when at least three eligible events exist. */
function itemListNode(model: PageModel): Node | null {
  if (model.events.length < 3) return null
  return {
    '@type': 'ItemList',
    itemListElement: model.events.map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: itemUrl(model.baseUrl, entry.item.id),
      name: itemDisplayTitle(entry.item),
      image: itemImageUrl(model, entry.item),
    })),
  }
}

/** The page's JSON-LD document, or null for pages without structured data (404/410). */
export function buildStructuredData(model: PageModel): Node | null {
  const base = model.baseUrl
  const graph: Node[] = []

  switch (model.kind) {
    case 'hub': {
      graph.push(websiteNode(model), organizationNode(model))
      for (const site of model.sites) graph.push(churchNode(model, site))
      const list = itemListNode(model)
      if (list) graph.push(list)
      break
    }
    case 'site': {
      if (!model.site) return null
      const church = churchNode(model, model.site)
      graph.push(church, {
        '@type': 'WebPage',
        '@id': `${base}/${model.site.slug}#webpage`,
        url: `${base}/${model.site.slug}`,
        name: `${model.config.siteName} – ${model.site.name}`,
        isPartOf: { '@id': websiteId(base) },
        about: { '@id': church['@id'] },
        inLanguage: model.lang,
      })
      const list = itemListNode(model)
      if (list) graph.push(list)
      break
    }
    case 'item': {
      if (!model.item) return null
      const url = itemUrl(base, model.item.id)
      const event = model.events[0] ? eventNode(model, model.events[0]) : null
      graph.push(compact({
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: itemDisplayTitle(model.item),
        isPartOf: { '@id': websiteId(base) },
        inLanguage: model.lang,
        mainEntity: event ? { '@id': event['@id'] } : null,
      }))
      if (event) graph.push(event)
      // The resolved site's Church is expanded inline: it is rendered in the item footer and
      // Google's validator needs the Place with its address on the same page.
      if (model.site) graph.push(churchNode(model, model.site))
      break
    }
    default:
      return null
  }

  return { '@context': 'https://schema.org', '@graph': graph }
}
