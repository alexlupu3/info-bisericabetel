import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionLink, buildEventFeed, type FeedEntry, type FeedInput, type FeedSite } from './rss.js'
import { buildLlmsTxt } from './llms-txt.js'
import { interpolate, resolveFeedStrings } from './feed-strings.js'

const BASE = 'https://hub.test'
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const sites: FeedSite[] = [
  { slug: 'centru', name: 'Centru', address: 'Str. Centrală 1, Cluj-Napoca' },
  { slug: 'vest', name: 'Vest', address: null },
]

const texts = {
  title: 'Evenimente — Betel Info',
  description: 'Evenimentele următoare ale bisericii Betel',
  when: 'Când',
  where: 'Unde',
  details: 'Detalii',
  untitled: 'Eveniment',
}

function entry(n: number, over: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id: UUID(n), type: 'card', sites: [], exclusiveSite: null, groupTitle: null,
    createdAt: '2026-10-20T09:12:00.000Z', ...over,
    data: { title: `Item ${n}`, startDate: '2026-11-14', ...(over.data ?? {}) },
  }
}

function input(over: Partial<FeedInput> = {}): FeedInput {
  return {
    baseUrl: BASE, site: null, lang: 'ro', isDefaultLang: true, dateLocale: 'ro-RO', texts,
    version: '1.2.3', sites, items: [], media: {}, ...over,
  }
}

/** The text of every `<tag>` element (unescaped only for the entities the serializer emits). */
function all(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g')
  return [...xml.matchAll(re)].map(m => m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'))
}

function items(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1])
}

/** Minimal well-formedness: declaration, balanced elements, no stray `&`/`<`. */
function assertWellFormed(xml: string) {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'))
  const stack: string[] = []
  const body = xml.replace(/^<\?xml[^>]*\?>/, '')
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, , selfClose] = m
    if (selfClose) continue
    if (close) assert.equal(stack.pop(), name, `unbalanced </${name}>`)
    else stack.push(name)
  }
  assert.deepEqual(stack, [])
  const text = body.replace(/<[^>]*>/g, '')
  assert.doesNotMatch(text, /<|&(?!amp;|lt;|gt;|quot;|apos;)/)
}

test('channel: fields, ttl, no lastBuildDate, generator, self link', () => {
  const xml = buildEventFeed(input())
  assertWellFormed(xml)
  assert.match(xml, /<rss version="2.0" xmlns:atom="http:\/\/www.w3.org\/2005\/Atom" xmlns:ev="http:\/\/purl.org\/rss\/1.0\/modules\/event\/" xmlns:betel="urn:betel:feed:1.0">/)
  assert.deepEqual(all(xml, 'title'), [texts.title, texts.title])
  assert.deepEqual(all(xml, 'link'), [`${BASE}/`, `${BASE}/`])
  assert.deepEqual(all(xml, 'language'), ['ro'])
  assert.deepEqual(all(xml, 'ttl'), ['5'])
  assert.deepEqual(all(xml, 'generator'), ['Betel Info 1.2.3'])
  assert.deepEqual(all(xml, 'url'), [`${BASE}/icons/icon-512.png`])
  assert.doesNotMatch(xml, /lastBuildDate|<pubDate>/)
  assert.match(xml, /<atom:link rel="self" type="application\/rss\+xml" href="https:\/\/hub.test\/feed.xml"\/>/)
  assert.equal(items(xml).length, 0, 'empty feed is a valid document with zero items')
})

test('self link of a site feed in a non-default language carries ?lang=', () => {
  const xml = buildEventFeed(input({ site: sites[0], lang: 'en', isDefaultLang: false }))
  assert.match(xml, /href="https:\/\/hub.test\/centru\/feed.xml\?lang=en"/)
  assert.equal(all(xml, 'link')[0], `${BASE}/centru`)
  assert.deepEqual(all(xml, 'language'), ['en'])
})

test('item: link, guid, pubDate, category, betel dates, document order kept', () => {
  const xml = buildEventFeed(input({ items: [entry(1), entry(2, { data: { startDate: '2026-11-20', endDate: '2026-11-22' } })] }))
  const [first, second] = items(xml)
  assert.deepEqual(all(first, 'link'), [`${BASE}/i/${UUID(1)}`])
  assert.match(first, new RegExp(`<guid isPermaLink="false">urn:uuid:${UUID(1)}</guid>`))
  assert.deepEqual(all(first, 'pubDate'), ['Tue, 20 Oct 2026 09:12:00 GMT'])
  assert.deepEqual(all(first, 'category'), ['card'])
  assert.deepEqual(all(first, 'betel:startDate'), ['2026-11-14'])
  assert.deepEqual(all(first, 'ev:enddate'), [])
  assert.deepEqual(all(second, 'ev:startdate'), ['2026-11-20'])
  assert.deepEqual(all(second, 'ev:enddate'), ['2026-11-22'])
  assert.deepEqual(all(second, 'betel:endDate'), ['2026-11-22'])
})

test('ev:startdate is a date, or a date-time with the Bucharest offset when startTime is set', () => {
  const xml = buildEventFeed(input({ items: [
    entry(1),
    entry(2, { data: { startDate: '2026-11-14', startTime: '18:00' } }),
    entry(3, { data: { startDate: '2026-07-01', startTime: '09:30' } }),
  ] }))
  const [a, b, c] = items(xml)
  assert.deepEqual(all(a, 'ev:startdate'), ['2026-11-14'])
  assert.deepEqual(all(a, 'betel:startTime'), [])
  assert.deepEqual(all(b, 'ev:startdate'), ['2026-11-14T18:00:00+02:00'])
  assert.deepEqual(all(b, 'betel:startTime'), ['18:00'])
  assert.deepEqual(all(c, 'ev:startdate'), ['2026-07-01T09:30:00+03:00'])
  assert.match(all(b, 'description')[0], /^Când: .*14.*noiembrie.*2026, 18:00$/m)
})

test('title fallback chain per type, never empty', () => {
  const xml = buildEventFeed(input({ items: [
    entry(1, { data: { title: '  ' } }),
    entry(2, { type: 'richtext', data: { title: undefined, body: '\n\n## *Seară* de rugăciune\nText' } }),
    entry(3, { type: 'richtext', data: { title: undefined, body: `# ${'a'.repeat(100)}` } }),
    entry(4, { type: 'poster', data: { title: undefined, alt: 'Afiș concert', name: 'admin-only' } }),
    entry(5, { type: 'poster', data: { title: undefined, name: 'admin-only' } }),
    entry(6, { type: 'video', data: { title: 'Predica', url: 'https://youtu.be/x' } }),
  ] }))
  const titles = items(xml).map(i => all(i, 'title')[0])
  assert.match(titles[0], /^Eveniment — .*14 noiembrie 2026$/)
  assert.equal(titles[1], 'Seară* de rugăciune')
  assert.equal(titles[2], 'a'.repeat(80))
  assert.equal(titles[3], 'Afiș concert')
  assert.match(titles[4], /^Eveniment — /)
  assert.doesNotMatch(titles[4], /admin-only/)
  assert.equal(titles[5], 'Predica')
})

test('location: data.location wins over the site, else the single applicable site, equal in both places', () => {
  const xml = buildEventFeed(input({ items: [
    entry(1, { sites: ['centru'] }),
    entry(2, { sites: ['vest'] }),
    entry(3, { sites: [] }),
    entry(4, { sites: ['centru', 'vest'] }),
    entry(5, { sites: ['centru'], data: { location: '  Sala   mare ' } }),
    entry(6, { sites: [], data: { location: 'Parcul Central & co' } }),
  ] }))
  const its = items(xml)
  const where = (i: string) => (all(i, 'description')[0].match(/^Unde: (.*)$/m) ?? [])[1] ?? null
  const loc = (i: string) => all(i, 'ev:location')[0] ?? null
  assert.equal(loc(its[0]), 'Centru — Str. Centrală 1, Cluj-Napoca')
  assert.equal(loc(its[1]), 'Vest')
  assert.equal(loc(its[2]), null, 'church-wide item in the all-sites feed has no place')
  assert.equal(loc(its[3]), null)
  assert.equal(loc(its[4]), 'Sala mare')
  assert.equal(loc(its[5]), 'Parcul Central & co', 'church-wide item with an explicit location')
  for (const i of its) assert.equal(where(i), loc(i))
})

test('location in a site feed is the feed site; betel:site multiplicity', () => {
  const xml = buildEventFeed(input({ site: sites[1], items: [
    entry(1, { sites: [] }),
    entry(2, { sites: ['centru', 'vest'] }),
    entry(3, { exclusiveSite: 'vest' }),
  ] }))
  const its = items(xml)
  for (const i of its) assert.deepEqual(all(i, 'ev:location'), ['Vest'])
  assert.equal([...its[0].matchAll(/<betel:site /g)].length, 1)
  assert.match(its[1], /<betel:site slug="centru">Centru<\/betel:site>[\s\S]*<betel:site slug="vest">Vest<\/betel:site>/)
  assert.match(its[2], /<betel:site slug="vest">Vest<\/betel:site>/)

  const allSitesXml = buildEventFeed(input({ items: [entry(1)] }))
  assert.doesNotMatch(allSitesXml, /<betel:site/)
})

test('betel:actionLink: site override in a site feed, default link elsewhere; details line', () => {
  const data = { link: 'https://example.org/all', siteLinks: { vest: 'https://example.org/vest' } }
  const siteXml = buildEventFeed(input({ site: sites[1], items: [entry(1, { data })] }))
  const allXml = buildEventFeed(input({ items: [entry(1, { data })] }))
  const centruXml = buildEventFeed(input({ site: sites[0], items: [entry(1, { data })] }))
  assert.deepEqual(all(siteXml, 'betel:actionLink'), ['https://example.org/vest'])
  assert.deepEqual(all(allXml, 'betel:actionLink'), ['https://example.org/all'])
  assert.deepEqual(all(centruXml, 'betel:actionLink'), ['https://example.org/all'])
  assert.match(all(items(siteXml)[0], 'description')[0], /^Detalii: https:\/\/example.org\/vest$/m)

  const noLink = buildEventFeed(input({ items: [entry(1, { data: { link: 'javascript:alert(1)' } })] }))
  assert.doesNotMatch(noLink, /actionLink|Detalii/)
})

test('description: when / where / details lines, blank line, item text', () => {
  const xml = buildEventFeed(input({ items: [
    entry(1, { sites: ['centru'], data: { link: 'https://f.example/x', description: 'Seară **de laudă**.' } }),
    entry(2, { type: 'poster', data: { alt: 'Afiș', imageUrl: '/uploads/a.webp' } }),
  ] }))
  const [card, poster] = items(xml).map(i => all(i, 'description')[0])
  const lines = card.split('\n')
  assert.match(lines[0], /^Când: /)
  assert.equal(lines[1], 'Unde: Centru — Str. Centrală 1, Cluj-Napoca')
  assert.equal(lines[2], 'Detalii: https://f.example/x')
  assert.equal(lines[3], '')
  assert.equal(lines[4], 'Seară **de laudă**.')
  assert.equal(poster.split('\n').length, 1)
})

test('enclosure from the matched media row only; omitted for unknown or external images', () => {
  const xml = buildEventFeed(input({
    items: [
      entry(1, { data: { thumbnail: '/uploads/a.webp' } }),
      entry(2, { data: { thumbnail: '/uploads/missing.webp' } }),
      entry(3, { data: { thumbnail: 'https://cdn.example/x.jpg' } }),
      entry(4, { type: 'poster', data: { imageUrl: '/uploads/p.png' } }),
      entry(5, { type: 'richtext', data: { body: 'x', thumbnail: '/uploads/a.webp' } }),
    ],
    media: {
      '/uploads/a.webp': { size: 183422, mimeType: 'image/webp' },
      '/uploads/p.png': { size: 99, mimeType: 'image/png' },
      'https://cdn.example/x.jpg': { size: 1, mimeType: 'image/jpeg' },
    },
  }))
  const its = items(xml)
  assert.match(its[0], /<enclosure url="https:\/\/hub.test\/uploads\/a.webp" length="183422" type="image\/webp"\/>/)
  assert.doesNotMatch(its[1], /enclosure/)
  assert.doesNotMatch(its[2], /enclosure/)
  assert.match(its[3], /<enclosure url="https:\/\/hub.test\/uploads\/p.png" length="99" type="image\/png"\/>/)
  assert.doesNotMatch(its[4], /enclosure/)
})

test('group title and XML escaping of & < > " \' with invalid characters removed', () => {
  const xml = buildEventFeed(input({ items: [entry(1, {
    groupTitle: 'Tineret & copii',
    data: { title: 'A <b>"bold"</b> & \'quoted\'\u0000 title 🎉', description: 'x\u0001y' },
  })] }))
  assertWellFormed(xml)
  assert.match(xml, /<title>A &lt;b&gt;&quot;bold&quot;&lt;\/b&gt; &amp; &apos;quoted&apos; title 🎉<\/title>/)
  assert.doesNotMatch(xml, /[\u0000\u0001]/)
  assert.deepEqual(all(xml, 'betel:group'), ['Tineret & copii'])
})

test('determinism: the same input yields byte-identical output, empty feed included', () => {
  const full = input({ site: sites[0], items: [entry(1, { sites: ['centru'] }), entry(2, { data: { startTime: '10:00' } })] })
  assert.equal(buildEventFeed(full), buildEventFeed(structuredClone(full)))
  assert.equal(buildEventFeed(input()), buildEventFeed(input()))
  const realNow = Date.now
  let frozen: string
  try {
    Date.now = () => 0
    frozen = buildEventFeed(full)
  } finally {
    Date.now = realNow
  }
  assert.equal(frozen, buildEventFeed(full), 'frozen and live clock give the same body')
})

test('feed strings: Romanian defaults, per-key fallback, interpolation', () => {
  const ro = resolveFeedStrings()
  assert.equal(ro['feed.title'], 'Evenimente — Betel Info')
  const en = resolveFeedStrings({ 'feed.when': 'When', 'feed.where': '  ' })
  assert.equal(en['feed.when'], 'When')
  assert.equal(en['feed.where'], 'Unde')
  assert.equal(interpolate(ro['feed.title.site'], { siteName: 'Vest' }), 'Evenimente — Betel Vest')
  assert.equal(interpolate('{a} {b}', { a: 'x' }), 'x {b}')
})

test('llms.txt lists every feed, hub page, language and the JSON API', () => {
  const txt = buildLlmsTxt({
    baseUrl: BASE,
    sites,
    languages: [{ code: 'en', isDefault: false }, { code: 'ro', isDefault: true }],
  })
  assert.match(txt, /^# Betel Info\n\n> /)
  assert.match(txt, /- \[All sites\]\(https:\/\/hub.test\/feed.xml\): /)
  assert.match(txt, /- \[Centru\]\(https:\/\/hub.test\/centru\/feed.xml\): current and upcoming events for Centru/)
  assert.match(txt, /- \[Vest\]\(https:\/\/hub.test\/vest\)$/m)
  assert.match(txt, /available codes: ro \(default\), en\./)
  assert.match(txt, /\(https:\/\/hub.test\/api\/content\?site=<slug>&locale=<code>\)/)
  assert.equal(txt, buildLlmsTxt({ baseUrl: BASE, sites, languages: [{ code: 'ro', isDefault: true }, { code: 'en', isDefault: false }] }))
})

test('llms.txt keeps an editor-controlled site name on one line (regression)', () => {
  const txt = buildLlmsTxt({
    baseUrl: BASE,
    sites: [{ slug: 'evil', name: 'Evil\n## Injected\r\n- [x](https://attacker.test)\u0000 [site]' }],
    languages: [{ code: 'ro', isDefault: true }],
  })
  assert.doesNotMatch(txt, /^## Injected/m)
  assert.doesNotMatch(txt, /^- \[x\]/m)
  assert.ok(!txt.includes('\u0000'))
  assert.match(txt, /^- \[Evil ## Injected - \\\[x\\\]\(https:\/\/attacker\.test\) \\\[site\\\]\]\(https:\/\/hub\.test\/evil\/feed\.xml\): current and upcoming events for Evil ## Injected - \[x\]\(https:\/\/attacker\.test\) \[site\]$/m)
})

test('actionLink keeps absolute http(s), mailto: and tel: links and drops the rest', () => {
  assert.equal(actionLink({ link: 'https://example.org/x' }, null), 'https://example.org/x')
  assert.equal(actionLink({ link: 'mailto:office@example.org' }, null), 'mailto:office@example.org')
  assert.equal(actionLink({ link: 'tel:+40700000000' }, null), 'tel:+40700000000')
  assert.equal(actionLink({ link: '/i/abc' }, null), null)
  assert.equal(actionLink({ link: 'javascript:alert(1)' }, null), null)
  assert.equal(actionLink({ link: 'ftp://example.org' }, null), null)
})
