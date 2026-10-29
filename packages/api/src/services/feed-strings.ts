// UI strings of the RSS feed (spec 02 §6.4): the `feed.*` keys with their Romanian
// defaults from UI_DEFAULTS (@betel/shared), translated through `ui_translations` for a
// non-default language with a per-key Romanian fallback — the server-side twin of
// `t(key, fallback, vars)` in the public hub's LanguageContext (ADR-014).
//
// The database client is imported lazily inside loadFeedStrings so the pure helpers can be
// unit-tested without DATABASE_URL.

import { and, eq, inArray } from 'drizzle-orm'
import { UI_DEFAULTS } from '@betel/shared'
import { uiTranslations } from '../db/schema.js'
import { DEFAULT_LOCALE } from './locale.js'

export const FEED_STRING_KEYS = [
  'feed.title',
  'feed.title.site',
  'feed.description',
  'feed.description.site',
  'feed.when',
  'feed.where',
  'feed.details',
  'feed.untitled',
] as const

export type FeedStringKey = typeof FEED_STRING_KEYS[number]

/** Raw (uninterpolated) feed strings, one per key. */
export type FeedStrings = Record<FeedStringKey, string>

/** Romanian defaults merged with the given translations (empty values fall back). */
export function resolveFeedStrings(translations: Partial<Record<string, string>> = {}): FeedStrings {
  const out = {} as FeedStrings
  for (const key of FEED_STRING_KEYS) {
    const translated = translations[key]
    out[key] = typeof translated === 'string' && translated.trim() !== '' ? translated : UI_DEFAULTS[key]
  }
  return out
}

/** `{name}` placeholders replaced like `t()`'s `vars`; unknown placeholders stay as written. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? vars[name] : match))
}

/** Feed strings for `lang`: one query for a non-default language, none for Romanian. */
export async function loadFeedStrings(lang: string): Promise<FeedStrings> {
  if (lang === DEFAULT_LOCALE) return resolveFeedStrings()
  const { db } = await import('../db/client.js')
  const rows = await db
    .select({ key: uiTranslations.key, value: uiTranslations.value })
    .from(uiTranslations)
    .where(and(eq(uiTranslations.locale, lang), inArray(uiTranslations.key, [...FEED_STRING_KEYS])))
  return resolveFeedStrings(Object.fromEntries(rows.map(r => [r.key, r.value])))
}
