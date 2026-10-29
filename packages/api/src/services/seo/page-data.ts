// Loads the data of a server-rendered public page from the database (spec 03 §6.3
// step 3): the same sites, languages and content the SPA would fetch from
// GET /api/sites, /api/languages and /api/content, in the default locale.

import { asc, desc, eq } from 'drizzle-orm'
import type { Language } from '@betel/shared'
import { db } from '../../db/client.js'
import { languages, sites } from '../../db/schema.js'
import { DEFAULT_LOCALE, findPublicItem, listPublicContent } from '../public-content.js'
import { publicBaseUrl } from '../public-url.js'
import { ensureOgImage, type OgImage } from '../og-image.js'
import { itemImageUrl, ogDerivativePath } from '../preview-image.js'
import { seoConfig } from './organization.js'
import { buildPageModel, type FeedItem, type PageModel, type PublicSite } from './page-model.js'

export async function loadSites(): Promise<PublicSite[]> {
  return db.select().from(sites).orderBy(sites.slug)
}

export async function loadLanguages(): Promise<Language[]> {
  return db.select().from(languages).where(eq(languages.enabled, true)).orderBy(desc(languages.isDefault), asc(languages.code))
}

/**
 * The item's 1200×630 share-image derivative (spec 06 FR-087), generated on first use so
 * og:image:width/height are real; null when the item has no uploaded image or it fails.
 */
async function loadShareImage(item: FeedItem): Promise<OgImage | null> {
  const upload = itemImageUrl(item.type, item.data)
  const path = upload ? ogDerivativePath(upload) : null
  if (!path) return null
  try {
    return await ensureOgImage(path.slice('/uploads/og/'.length))
  } catch (e) {
    console.error(`seo: could not build ${path}`, e)
    return null
  }
}

export type PageRequest =
  | { kind: 'hub'; path: string }
  | { kind: 'site'; path: string; siteSlug: string }
  | { kind: 'item'; path: string; itemId: string }

/** Builds the page model; unknown site slugs and invisible items become 404/410 models. */
export async function loadPageModel(req: PageRequest): Promise<PageModel> {
  const [siteRows, languageRows] = await Promise.all([loadSites(), loadLanguages()])
  const common = { path: req.path, baseUrl: publicBaseUrl(), config: seoConfig(), sites: siteRows, languages: languageRows }

  if (req.kind === 'hub') {
    const items = await listPublicContent({ site: null, locale: DEFAULT_LOCALE })
    return buildPageModel({ ...common, kind: 'hub', items: items as FeedItem[] })
  }

  if (req.kind === 'site') {
    if (!siteRows.some(s => s.slug === req.siteSlug)) return buildPageModel({ ...common, kind: 'not-found' })
    const items = await listPublicContent({ site: req.siteSlug, locale: DEFAULT_LOCALE })
    return buildPageModel({ ...common, kind: 'site', siteSlug: req.siteSlug, items: items as FeedItem[] })
  }

  const found = await findPublicItem(req.itemId, DEFAULT_LOCALE)
  if (found.status === 'visible') {
    const item = found.item as FeedItem
    return buildPageModel({ ...common, kind: 'item', item, shareImage: await loadShareImage(item) })
  }
  return buildPageModel({ ...common, kind: found.status === 'gone' ? 'gone' : 'not-found' })
}
