// Assembles a server-rendered public page: template + head + snapshot + inline data.

import { DEFAULT_LOCALE } from '../locale.js'
import type { PageModel } from './page-model.js'
import { renderHead } from './render-head.js'
import { renderSnapshot } from './render-snapshot.js'
import type { PageTemplate } from './template.js'

/**
 * The JSON the SPA seeds React Query with (packages/app/src/public/initial-data.ts), so the
 * first paint needs no API round-trip. Shapes match GET /api/sites, /api/languages,
 * /api/content and /api/content/:id exactly.
 */
export function initialData(model: PageModel) {
  const contentSite = model.kind === 'site' ? model.site?.slug ?? null : null
  return {
    path: model.path,
    locale: DEFAULT_LOCALE,
    sites: model.sites,
    languages: model.languages,
    content: model.kind === 'hub' || model.kind === 'site' ? { site: contentSite, items: model.items } : null,
    item: model.kind === 'item' ? model.item : null,
    seo: {
      siteName: model.config.siteName,
      orgName: model.config.orgName,
      orgWebsite: model.config.orgWebsite,
      baseUrl: model.baseUrl,
    },
  }
}

export function renderPage(model: PageModel, template: PageTemplate): string {
  const head = renderHead(model)
  return template.render({
    lang: model.lang,
    title: head.title,
    headTags: head.tags,
    snapshot: renderSnapshot(model),
    initialData: initialData(model),
  })
}
