// Server-rendered HTML snapshot of a public page (spec 03 FR-070, ADR-022).
//
// A small, dependency-free mirror of what the SPA renders for the default locale:
// hero <h1>, the site switcher as plain links, groups as <section> + <h2>, items as
// <article> with headings, <time datetime>, plain-text descriptions, links and images
// with alt. React replaces it on mount (createRoot, no hydration).
//
// Keep in sync with packages/app/src/public (HomePage, ItemPage, content components):
// cypress/e2e/snapshot-parity.cy.ts compares (title, date, link) per item.
// Classes are the SPA's Tailwind classes (this file is in the app's Tailwind content).

import { UI_DEFAULTS, itemDisplayTitle, itemPlainText, itemWhen, siteAddressLine } from '@betel/shared'
import { escapeHtml, safeUrl } from './escape.js'
import { itemImagePath } from './item-image.js'
import { groupFeed, type FeedItem, type PageModel, type PublicSite } from './page-model.js'
import { hasGeo } from './structured-data.js'

const DATE_LOCALE = 'ro-RO'

/** Map link carrying the site's coordinates (rendered only when the site has them). */
export function siteMapUrl(site: PublicSite): string {
  return `https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`
}

export function telHref(telephone: string): string {
  return `tel:${telephone.replace(/[^\d+]/g, '')}`
}

function extractYoutubeId(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  const match = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return match?.[1] ?? (raw.length === 11 ? raw : null)
}

/** Link an item opens: per-site override for the active site, else `data.link` (ADR-007). */
function resolvedLink(item: FeedItem, activeSite: string | null): string | null {
  const d = item.data
  const overrides = d.siteLinks as Record<string, unknown> | undefined
  const override = activeSite && overrides && typeof overrides === 'object' ? overrides[activeSite] : undefined
  return safeUrl(override || d.link)
}

interface RenderContext {
  model: PageModel
  activeSite: string | null
  showSiteLabel: boolean
  /** True until the first image of the page has been rendered (eager + high priority). */
  firstImage: { pending: boolean }
}

function imageAttrs(ctx: RenderContext): string {
  if (ctx.firstImage.pending) {
    ctx.firstImage.pending = false
    return 'fetchpriority="high" decoding="async"'
  }
  return 'loading="lazy" decoding="async"'
}

function siteLabel(item: FeedItem, ctx: RenderContext): string {
  if (!ctx.showSiteLabel || item.sites.length !== 1) return ''
  const site = ctx.model.sites.find(s => s.slug === item.sites[0])
  if (!site) return ''
  return `<div class="flex flex-wrap gap-x-2 gap-y-0.5 -mt-1 mb-3"><span class="text-sm font-bold font-content">${escapeHtml(site.name)}</span></div>`
}

function whenLine(item: FeedItem): string {
  const when = itemWhen(item.data, DATE_LOCALE)
  if (!when) return ''
  const inner = when.dateTime
    ? `<time datetime="${escapeHtml(when.dateTime)}">${escapeHtml(when.text)}</time>`
    : escapeHtml(when.text)
  return `<p class="text-[10px] tracking-widest uppercase font-content mb-2 text-[var(--muted)]">${inner}</p>`
}

function wrapLink(html: string, href: string | null): string {
  if (!href) return html
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="group block">${html}</a>`
}

function renderItem(item: FeedItem, level: 2 | 3, ctx: RenderContext): string {
  const title = itemDisplayTitle(item)
  const h = `h${level}`
  const id = escapeHtml(item.id)

  switch (item.type) {
    case 'card': {
      const thumb = itemImagePath(item)
      const text = itemPlainText(item)
      const link = resolvedLink(item, ctx.activeSite)
      const cta = typeof item.data.cta === 'string' && item.data.cta.trim() && link ? item.data.cta : null
      const html = `<article data-item-id="${id}" class="relative border border-[var(--border)] bg-[var(--surface)] overflow-hidden">`
        + (thumb
          ? `<div class="aspect-[16/9] overflow-hidden bg-[var(--surface)]"><img src="${escapeHtml(thumb)}" alt="" width="1600" height="900" ${imageAttrs(ctx)} class="w-full h-full object-cover"></div>`
          : '')
        + `<div class="p-4">${whenLine(item)}`
        + `<${h} class="betel-title-bold text-xl leading-tight mb-2">${escapeHtml(title ?? '')}</${h}>`
        + siteLabel(item, ctx)
        + (text ? `<p class="font-content text-sm text-[var(--muted)] leading-relaxed mb-4">${escapeHtml(text)}</p>` : '')
        + (cta ? `<span class="inline-block px-4 py-2 text-xs tracking-widest uppercase font-content border border-[var(--text)] text-[var(--text)]">${escapeHtml(cta)}</span>` : '')
        + `</div></article>`
      return wrapLink(html, link)
    }
    case 'richtext': {
      const text = itemPlainText(item)
      return `<article data-item-id="${id}" class="border-l-2 border-[var(--border)] bg-[var(--surface)] pl-4 pr-4 py-3">`
        + (title ? `<${h} class="betel-title-bold text-lg leading-tight mb-2">${escapeHtml(title)}</${h}>` : '')
        + siteLabel(item, ctx)
        + (text ? `<div class="prose-betel"><p>${escapeHtml(text)}</p></div>` : '')
        + `</article>`
    }
    case 'poster': {
      const src = itemImagePath(item)
      if (!src) return ''
      const html = `<article data-item-id="${id}" class="relative overflow-hidden">`
        + `<img src="${escapeHtml(src)}" alt="${escapeHtml(item.data.alt ?? '')}" width="1080" height="1350" ${imageAttrs(ctx)} class="w-full h-auto object-cover">`
        + siteLabel(item, ctx)
        + `</article>`
      return wrapLink(html, resolvedLink(item, ctx.activeSite))
    }
    case 'video': {
      const videoId = extractYoutubeId(item.data.url ?? item.data.youtubeId)
      if (!videoId) return ''
      return `<article data-item-id="${id}">`
        + (title ? `<${h} class="betel-title-bold text-lg leading-tight mb-2">${escapeHtml(title)}</${h}>` : '')
        + siteLabel(item, ctx)
        + `<p class="font-content text-sm"><a href="https://www.youtube.com/watch?v=${escapeHtml(videoId)}">${escapeHtml(title ?? 'YouTube')}</a></p>`
        + `</article>`
    }
    default:
      return ''
  }
}

function renderFeed(ctx: RenderContext): string {
  const { model } = ctx
  if (model.items.length === 0) {
    const text = model.site
      ? UI_DEFAULTS['content.empty.withSite'].replaceAll('{siteName}', model.site.name)
      : UI_DEFAULTS['content.empty.noSite']
    return `<p class="font-content text-sm text-[var(--muted)] leading-relaxed">${escapeHtml(text)}</p>`
  }
  const blocks = groupFeed(model.items).map(block => {
    if (block.kind === 'group') {
      return `<section aria-label="${escapeHtml(block.title)}">`
        + `<header class="flex items-center gap-3 mb-6"><h2 class="betel-title-bold text-sm tracking-widest uppercase">${escapeHtml(block.title)}</h2></header>`
        + `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">`
        + block.items.map(item => renderItem(item, 3, ctx)).join('')
        + `</div></section>`
    }
    return renderItem(block.item, 2, ctx)
  })
  return `<div class="space-y-8">${blocks.map(b => `<div>${b}</div>`).join('')}</div>`
}

function renderHero(model: PageModel): string {
  const site = model.kind === 'site' || model.kind === 'item' ? model.site : null
  const bold = site ? 'BETEL' : 'BISERICA'
  const light = site ? site.name.toUpperCase() : 'BETEL'
  const website = safeUrl(model.config.orgWebsite)
  return `<header class="border-b border-[var(--border)]"><div class="max-w-4xl mx-auto w-full px-5 pt-10 pb-8 text-center">`
    + `<img src="/icons/favicon-dark.svg" alt="" width="54" height="64" class="mb-4 betel-logo">`
    + `<h1 class="text-4xl leading-none"><span class="betel-title-bold">${escapeHtml(bold)}</span><span class="betel-title-condensed">${escapeHtml(light)}</span></h1>`
    + `<p class="mt-3 font-content text-sm text-[var(--muted)] leading-relaxed">${escapeHtml(UI_DEFAULTS['hero.subtitle'])}</p>`
    + (website
      ? `<a href="${escapeHtml(website)}" class="mt-1 inline-block font-content text-xs text-[var(--muted)]">${escapeHtml(website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`
      : '')
    + `</div></header>`
}

function renderNav(model: PageModel): string {
  if (model.kind !== 'hub' && model.kind !== 'site') {
    // Item and not-found pages: a way back to the hub (the item's site when it has one).
    const back = model.kind === 'item' && model.site ? `/${model.site.slug}` : '/'
    return `<nav aria-label="${escapeHtml(UI_DEFAULTS['nav.sites'])}" class="border-b border-[var(--border)]">`
      + `<div class="max-w-4xl mx-auto w-full px-5 py-3"><a href="${escapeHtml(back)}" class="text-xs tracking-widest uppercase font-content text-[var(--muted)]">${escapeHtml(UI_DEFAULTS['item.backToHub'])}</a></div></nav>`
  }
  const links = [
    `<li><a href="/">${escapeHtml(UI_DEFAULTS['sites.all'])}</a></li>`,
    ...model.sites.map(s => `<li><a href="/${escapeHtml(s.slug)}">${escapeHtml(s.name)}</a></li>`),
  ]
  return `<nav aria-label="${escapeHtml(UI_DEFAULTS['nav.sites'])}" class="border-b border-[var(--border)]">`
    + `<ul class="max-w-4xl mx-auto w-full px-5 py-3 flex flex-wrap gap-x-4 gap-y-1 text-xs tracking-widest uppercase text-[var(--muted)]">${links.join('')}</ul></nav>`
}

/** One site's name + address line (+ phone and map links when known): the visible Church data. */
export function renderSiteAddress(site: PublicSite): string {
  const address = siteAddressLine(site)
  const parts = [`<a href="/${escapeHtml(site.slug)}" class="font-bold text-[var(--text)]">${escapeHtml(site.name)}</a>`]
  if (address) parts.push(`<span>${escapeHtml(address)}</span>`)
  if (site.telephone?.trim()) {
    parts.push(`<a href="${escapeHtml(telHref(site.telephone))}">${escapeHtml(site.telephone.trim())}</a>`)
  }
  if (hasGeo(site)) parts.push(`<a href="${escapeHtml(siteMapUrl(site))}">Google Maps</a>`)
  return `<li class="flex flex-wrap gap-x-2">${parts.join(' · ')}</li>`
}

function renderFooter(model: PageModel, footerSites: PublicSite[]): string {
  const year = new Date().getFullYear()
  return `<footer class="border-t border-[var(--border)]"><div class="max-w-4xl mx-auto w-full px-5 py-6">`
    + (footerSites.length > 0
      ? `<ul class="mb-4 space-y-1 text-[10px] tracking-widest uppercase text-[var(--muted)] font-content">${footerSites.map(renderSiteAddress).join('')}</ul>`
      : '')
    + `<p class="text-[10px] tracking-widest uppercase text-[var(--muted)] font-content">© ${year} ${escapeHtml(UI_DEFAULTS['footer.copyright'])}</p>`
    + `</div></footer>`
}

function renderItemMain(model: PageModel, ctx: RenderContext): string {
  const item = model.item
  if (!item || model.kind !== 'item') {
    return `<p class="font-content text-sm text-[var(--muted)] leading-relaxed">${escapeHtml(UI_DEFAULTS['item.notFound'])}</p>`
      + `<p class="mt-6"><a href="/" class="font-content text-xs tracking-widest uppercase">${escapeHtml(UI_DEFAULTS['item.backToHub'])}</a></p>`
  }
  return `<div class="max-w-xl mx-auto w-full">${renderItem(item, 2, ctx)}</div>`
}

/** The snapshot HTML placed inside <div id="root"> for a public page. */
export function renderSnapshot(model: PageModel): string {
  const activeSite = model.kind === 'site' || model.kind === 'item' ? model.site?.slug ?? null : null
  const ctx: RenderContext = {
    model,
    activeSite,
    showSiteLabel: model.kind === 'hub',
    firstImage: { pending: true },
  }
  const isHub = model.kind === 'hub' || model.kind === 'site'
  const main = isHub ? renderFeed(ctx) : renderItemMain(model, ctx)
  const footerSites = model.kind === 'hub' ? model.sites : model.site ? [model.site] : []

  return `<div class="min-h-full flex flex-col">`
    + renderHero(model)
    + renderNav(model)
    + `<main class="flex-1 py-12" aria-label="${escapeHtml(UI_DEFAULTS['seo.feedLabel'])}"><div class="max-w-4xl mx-auto w-full px-5 space-y-10">${main}</div></main>`
    + renderFooter(model, footerSites)
    + `</div>`
}
