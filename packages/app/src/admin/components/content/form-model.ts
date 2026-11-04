import { normalizeLocationText } from '@betel/shared'
import type { ContentItem } from '../../api/client'

export const CONTENT_TYPES = ['card', 'richtext', 'poster', 'video'] as const

// ── Shared form state ──────────────────────────────────────────────────────────

export type FormData = {
  type: string; sites: string[]; exclusiveSite: string | null; expiresAt: string; groupId: string
  title: string; body: string; description: string; date: string; endDate: string; startTime: string; location: string; link: string; cta: string; imageUrl: string; url: string
  name: string; thumbnail: string
  siteLinks: Record<string, string>
}

export function itemToForm(item?: ContentItem | null): FormData {
  const d = (item?.data ?? {}) as Record<string, any>
  return {
    type:        item?.type ?? 'card',
    sites:       item?.sites ?? [],
    exclusiveSite: item?.exclusiveSite ?? null,
    // Kept verbatim: truncating to YYYY-MM-DD would re-save it as UTC midnight.
    expiresAt:   item?.expiresAt ?? '',
    groupId:     item?.groupId ?? '',
    title:       d.title ?? '',
    body:        d.body  ?? '',
    description: d.description ?? '',
    date:        d.startDate ?? '',
    link:        d.link  ?? '',
    endDate:     d.endDate ?? '',
    startTime:   d.startTime ?? '',
    location:    d.location ?? '',
    cta:         d.cta   ?? '',
    imageUrl:    d.imageUrl   ?? '',
    url:         d.url        ?? '',
    name:        d.name       ?? '',
    thumbnail:   d.thumbnail  ?? '',
    siteLinks:   d.siteLinks ?? {},
  }
}

export function formToPayload(f: FormData) {
  const data: Record<string, any> = {}
  // Filter out empty siteLinks entries
  const siteLinks = Object.fromEntries(Object.entries(f.siteLinks).filter(([, v]) => v))
  if (f.type === 'richtext') {
    data.title = f.title || null
    data.body = f.body
  } else if (f.type === 'card') {
    data.title       = f.title
    data.description = f.description || null
    data.link        = f.link        || null
    data.cta         = f.cta         || null
    data.location    = normalizeLocationText(f.location) || null
    data.thumbnail   = f.thumbnail   || null
    data.siteLinks   = Object.keys(siteLinks).length ? siteLinks : null
  } else if (f.type === 'poster') {
    data.imageUrl  = f.imageUrl
    data.name      = f.name || null
    data.link      = f.link || null
    data.siteLinks = Object.keys(siteLinks).length ? siteLinks : null
  } else if (f.type === 'video') {
    data.url   = f.url
    data.title = f.title || null
  }
  // Shared date fields — null means "clear the date"
  data.startDate = f.date    || null
  data.endDate   = f.endDate || null
  // The start time only exists on single-day events (BR-035); otherwise always clear it.
  const singleDay = !!f.date && (!f.endDate || f.endDate === f.date)
  data.startTime = singleDay && f.startTime ? f.startTime : null
  const exclusive = f.exclusiveSite !== null
  return {
    type: f.type,
    sites: exclusive ? [] : f.sites,
    exclusiveSite: f.exclusiveSite,
    groupId: f.groupId || null,
    expiresAt: f.expiresAt || null,
    data,
  }
}

