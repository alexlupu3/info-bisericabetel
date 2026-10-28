import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Language } from '@betel/shared'
import { readSeoConfig } from './organization.js'
import { buildPageModel, groupFeed, type FeedItem, type PublicSite } from './page-model.js'
import { buildStructuredData } from './structured-data.js'
import { renderHead } from './render-head.js'
import { renderSnapshot } from './render-snapshot.js'
import { parseTemplate } from './template.js'
import { renderPage } from './render-page.js'
import { registerHeadTags } from './head-tags.js'
import { serializeJsonForScript, escapeHtml } from './escape.js'
import { sitemapEntries, sitemapXml } from './sitemap.js'

const BASE = 'https://hub.test'
const config = readSeoConfig({})
const languages: Language[] = [
  { code: 'ro', name: 'Română', isDefault: true, enabled: true },
  { code: 'en', name: 'English', isDefault: false, enabled: true },
]
const sites: PublicSite[] = [
  { slug: 'centru', name: 'Centru', accent: '#f60', address: 'Str. Centrală 1, Cluj-Napoca' },
  {
    slug: 'vest', name: 'Vest', accent: '#a03', address: null,
    streetAddress: 'Str. Vestului 2', postalCode: '400100', addressLocality: 'Cluj-Napoca',
    latitude: 46.77, longitude: 23.59, telephone: '+40 700 000 000',
  },
]

function item(id: string, over: Partial<FeedItem> & { data?: Record<string, unknown> } = {}): FeedItem {
  return {
    id, type: 'card', state: 'published', sites: [], exclusiveSite: null, orderPosition: 0,
    groupId: null, groupTitle: null, expiresAt: null, createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-02T10:00:00Z', ...over, data: { title: `Item ${id}`, ...(over.data ?? {}) },
  }
}

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function graphTypes(doc: Record<string, unknown> | null): string[] {
  return ((doc?.['@graph'] as Array<Record<string, unknown>>) ?? []).map(n => String(n['@type']))
}

test('hub page: WebSite, Organization, one Church per site; ItemList only with ≥3 eligible events', () => {
  const items = [
    item(UUID(1), { exclusiveSite: 'centru', data: { startDate: '2099-01-03' } }),
    item(UUID(2), { sites: ['vest'], data: { startDate: '2099-01-01', startTime: '18:00' } }),
    item(UUID(3), { data: { startDate: '2099-01-02' } }), // all sites → no single place → not an event
    item(UUID(4), { type: 'richtext', exclusiveSite: 'centru', data: { body: 'x', startDate: '2099-01-02' } }),
  ]
  let model = buildPageModel({ kind: 'hub', path: '/', baseUrl: BASE, config, sites, languages, items })
  assert.deepEqual(model.events.map(e => e.item.id), [UUID(2), UUID(1)])
  assert.deepEqual(graphTypes(buildStructuredData(model)), ['WebSite', 'Organization', 'Church', 'Church'])

  items.push(item(UUID(5), { sites: ['centru'], data: { startDate: '2099-01-05' } }))
  model = buildPageModel({ kind: 'hub', path: '/', baseUrl: BASE, config, sites, languages, items })
  const doc = buildStructuredData(model)!
  assert.deepEqual(graphTypes(doc), ['WebSite', 'Organization', 'Church', 'Church', 'ItemList'])
  const list = (doc['@graph'] as any[])[4]
  assert.equal(list.itemListElement.length, 3)
  assert.equal(list.itemListElement[0].url, `${BASE}/i/${UUID(2)}`)
  assert.equal(list.itemListElement[0].position, 1)
})

test('Church: geo and telephone only when present; address from structured fields or free text', () => {
  const model = buildPageModel({ kind: 'hub', path: '/', baseUrl: BASE, config, sites, languages, items: [] })
  const [, , centru, vest] = buildStructuredData(model)!['@graph'] as any[]
  assert.equal(centru['@id'], `${BASE}/centru#place`)
  assert.equal(centru.address.streetAddress, 'Str. Centrală 1, Cluj-Napoca')
  assert.equal(centru.address.addressCountry, 'RO')
  assert.equal(centru.geo, undefined)
  assert.equal(centru.telephone, undefined)
  assert.equal(vest.address.postalCode, '400100')
  assert.equal(vest.geo.latitude, 46.77)
  assert.equal(vest.telephone, '+40 700 000 000')
  // ... and the snapshot renders what the markup claims
  const html = renderSnapshot(model)
  assert.match(html, /Str\. Vestului 2, 400100 Cluj-Napoca/)
  assert.match(html, /href="tel:\+40700000000"/)
  assert.match(html, /maps\/search\/\?api=1&amp;query=46\.77,23\.59/)
})

test('item page: Event with Bucharest offset, Place from the resolved site, Church inline', () => {
  const it = item(UUID(7), {
    exclusiveSite: 'centru',
    data: { title: 'Concert', description: '**Seară** de [laudă](https://x)', startDate: '2099-11-14', startTime: '18:00', thumbnail: '/uploads/a.jpg' },
  })
  const model = buildPageModel({ kind: 'item', path: `/i/${UUID(7)}`, baseUrl: BASE, config, sites, languages, item: it })
  const graph = buildStructuredData(model)!['@graph'] as any[]
  assert.deepEqual(graph.map(n => n['@type']), ['WebPage', 'Event', 'Church'])
  const event = graph[1]
  assert.equal(event.startDate, '2099-11-14T18:00:00+02:00')
  assert.equal(event.description, 'Seară de laudă')
  assert.deepEqual(event.image, [`${BASE}/uploads/a.jpg`])
  assert.equal(event.url, `${BASE}/i/${UUID(7)}`)
  assert.equal(event.location['@type'], 'Place')
  assert.equal(event.location.name, 'Centru')
  assert.equal(event.location.containedInPlace['@id'], `${BASE}/centru#place`)
  assert.equal(graph[0].mainEntity['@id'], event['@id'])

  const head = renderHead(model)
  assert.equal(head.title, 'Concert – Centru')
  assert.match(head.tags, /<link rel="canonical" href="https:\/\/hub\.test\/i\/00000000-0000-4000-8000-000000000007">/)
  assert.match(head.tags, /property="og:type" content="article"/)
  assert.match(head.tags, /property="og:image" content="https:\/\/hub\.test\/uploads\/a\.jpg"/)
  assert.match(head.tags, /name="twitter:card" content="summary_large_image"/)
})

test('item without a resolvable site is not an Event; multi-day events use date-only startDate', () => {
  const noSite = buildPageModel({ kind: 'item', path: '/i/x', baseUrl: BASE, config, sites, languages, item: item(UUID(8), { data: { startDate: '2099-01-01' } }) })
  assert.deepEqual(graphTypes(buildStructuredData(noSite)), ['WebPage'])
  const multi = buildPageModel({
    kind: 'item', path: '/i/y', baseUrl: BASE, config, sites, languages,
    item: item(UUID(9), { sites: ['vest'], data: { startDate: '2099-01-01', endDate: '2099-01-03', startTime: '18:00' } }),
  })
  const event = (buildStructuredData(multi)!['@graph'] as any[])[1]
  assert.equal(event.startDate, '2099-01-01')
  assert.equal(event.endDate, '2099-01-03')
})

test('404 model: noindex, no canonical, no JSON-LD', () => {
  const model = buildPageModel({ kind: 'not-found', path: '/nope', baseUrl: BASE, config, sites, languages })
  assert.equal(model.status, 404)
  const head = renderHead(model)
  assert.match(head.tags, /<meta name="robots" content="noindex">/)
  assert.doesNotMatch(head.tags, /canonical/)
  assert.doesNotMatch(head.tags, /ld\+json/)
  assert.equal(buildPageModel({ kind: 'gone', path: '/i/z', baseUrl: BASE, config, sites, languages }).status, 410)
})

test('hub and site titles/descriptions follow the shared rules', () => {
  const hub = renderHead(buildPageModel({ kind: 'hub', path: '/', baseUrl: BASE, config, sites, languages, items: [] }))
  assert.equal(hub.title, 'Betel Info – Biserica Baptistă Betel')
  assert.match(hub.tags, /Locații: Centru, Vest\./)
  const site = renderHead(buildPageModel({ kind: 'site', siteSlug: 'centru', path: '/centru', baseUrl: BASE, config, sites, languages, items: [] }))
  assert.equal(site.title, 'Centru – Biserica Baptistă Betel')
  assert.match(site.tags, /Locația Centru, Str\. Centrală 1, Cluj-Napoca\./)
  assert.match(site.tags, /property="og:image:width" content="512"/)
})

test('escaping: database text can neither break HTML nor close the JSON-LD script', () => {
  const evil = '</script><img src=x onerror=alert(1)>'
  const it = item(UUID(10), { exclusiveSite: 'centru', data: { title: evil, startDate: '2099-01-01', description: evil } })
  const model = buildPageModel({ kind: 'hub', path: '/', baseUrl: BASE, config, sites, languages, items: [it] })
  const template = parseTemplate('<!doctype html><html lang="ro"><head><title>Betel Info</title></head><body><div id="root"></div></body></html>')
  const html = renderPage(model, template)
  assert.equal(html.match(/<\/script>/g)?.length, 2) // JSON-LD + inline data, nothing else
  assert.doesNotMatch(html, /<img src=x/)
  assert.match(html, /&lt;\/script&gt;&lt;img src=x onerror=alert\(1\)&gt;/)
  const data = html.match(/<script id="betel-initial-data" type="application\/json">([\s\S]*?)<\/script>/)![1]
  assert.equal(JSON.parse(data).content.items[0].data.title, evil)
  assert.equal(serializeJsonForScript(' <&>'), '"\\u2028\\u003c\\u0026\\u003e"')
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;')
})

test('template: replaces title and lang, injects head tags, snapshot and inline data; missing anchors fail', () => {
  const template = parseTemplate('<html lang="xx"><head><title>Old</title></head><body><div id="root"></div></body></html>')
  const out = template.render({ lang: 'ro', title: 'A & B', headTags: '<meta name="x">', snapshot: '<p>s</p>', initialData: { a: 1 } })
  assert.match(out, /<html lang="ro">/)
  assert.match(out, /<title>A &amp; B<\/title>/)
  assert.match(out, /<meta name="x">\n {2}<\/head>/)
  assert.match(out, /<div id="root"><p>s<\/p><\/div>/)
  assert.match(out, /<script id="betel-initial-data" type="application\/json">\{"a":1\}<\/script>/)
  assert.throws(() => parseTemplate('<html lang="ro"><head></head><body><div id="root"></div></body></html>'), /<title>/)
})

test('registerHeadTags contributes tags; a failing contributor is skipped', () => {
  const off1 = registerHeadTags(page => page.kind === 'site' ? [`<link rel="alternate" href="/${page.site!.slug}/feed.xml">`] : [])
  const off2 = registerHeadTags(() => { throw new Error('boom') })
  const origError = console.error
  console.error = () => {}
  try {
    const head = renderHead(buildPageModel({ kind: 'site', siteSlug: 'vest', path: '/vest', baseUrl: BASE, config, sites, languages, items: [] }))
    assert.match(head.tags, /<link rel="alternate" href="\/vest\/feed\.xml">/)
  } finally {
    console.error = origError
    off1()
    off2()
  }
})

test('snapshot: one h1, group titles h2 and items h3, root items h2, first image eager', () => {
  const items = [
    item(UUID(11), { data: { thumbnail: '/uploads/1.jpg', startDate: '2099-03-01' } }),
    item(UUID(12), { groupId: 'g', groupTitle: 'Grup', data: { thumbnail: '/uploads/2.jpg' } }),
    item(UUID(13), { type: 'poster', groupId: 'g', groupTitle: 'Grup', data: { imageUrl: '/uploads/3.jpg', alt: 'Afiș' } }),
  ]
  const model = buildPageModel({ kind: 'hub', path: '/', baseUrl: BASE, config, sites, languages, items })
  assert.equal(groupFeed(items).length, 2)
  const html = renderSnapshot(model)
  assert.equal(html.match(/<h1/g)?.length, 1)
  assert.match(html, /<h2 [^>]*>Item 00000000-0000-4000-8000-000000000011<\/h2>/)
  assert.match(html, /<h2 [^>]*>Grup<\/h2>/)
  assert.match(html, /<h3 [^>]*>Item 00000000-0000-4000-8000-000000000012<\/h3>/)
  assert.match(html, /<time datetime="2099-03-01">/)
  assert.match(html, /src="\/uploads\/1\.jpg" alt="" width="1600" height="900" fetchpriority="high"/)
  assert.match(html, /src="\/uploads\/2\.jpg" alt="" width="1600" height="900" loading="lazy"/)
  assert.match(html, /alt="Afiș"/)
})

test('sitemap: hub, site pages and each visible item once, lastmod from updatedAt', () => {
  const a = { id: 'a', updatedAt: '2026-10-05T10:00:00Z' }
  const b = { id: 'b', updatedAt: '2026-10-07T10:00:00Z' }
  const entries = sitemapEntries([a], [{ slug: 'centru', items: [a, b] }, { slug: 'vest', items: [] }])
  assert.deepEqual(entries, [
    { path: '/', lastmod: '2026-10-05' },
    { path: '/centru', lastmod: '2026-10-07' },
    { path: '/vest', lastmod: null },
    { path: '/i/a', lastmod: '2026-10-05' },
    { path: '/i/b', lastmod: '2026-10-07' },
  ])
  const xml = sitemapXml(entries)
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.match(xml, /<url><loc>http[^<]+\/i\/b<\/loc><lastmod>2026-10-07<\/lastmod><\/url>/)
})
