import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import {
  buildPreview,
  isPreviewCrawler,
  pickLocale,
  renderPreviewHtml,
  safeDestination,
  type PreviewInput,
} from './share-preview.js'
import { accentHex, brandDerivativePath, itemImageUrl, ogDerivativePath } from './preview-image.js'
import { configureOgImages, ensureOgImage, OG_MAX_BYTES } from './og-image.js'
import { initPublicBaseUrl } from './public-url.js'

initPublicBaseUrl({ PUBLIC_BASE_URL: 'https://hub.test' })

const UUID = '0b7f2c1e-1111-4222-8333-444455556666'
const itemImage = { name: `${UUID}.jpg`, width: 1200, height: 630 }
const brandImage = { name: 'brand-111111.jpg', width: 1200, height: 630 }

function input(overrides: Partial<PreviewInput> = {}): PreviewInput {
  return {
    code: 'abc123',
    mode: 'content',
    item: { type: 'card', data: { title: 'Seara de rugăciune', thumbnail: `/uploads/${UUID}.webp` } },
    site: null,
    locale: 'ro',
    langParam: null,
    destination: 'https://forms.example/x',
    hubName: 'Biserica Baptistă Betel',
    itemImage,
    brandImage,
    ...overrides,
  }
}

test('isPreviewCrawler: messaging-app crawlers yes, browsers and search bots no', () => {
  assert.ok(isPreviewCrawler('WhatsApp/2.24.20.72 I'))
  assert.ok(isPreviewCrawler('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'))
  assert.ok(isPreviewCrawler('Mozilla/5.0 (Macintosh) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0'))
  assert.ok(isPreviewCrawler('TelegramBot (like TwitterBot)'))
  assert.ok(isPreviewCrawler('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'))
  assert.ok(isPreviewCrawler('Mozilla/5.0 (compatible; Google-PageRenderer Google (+https://developers.google.com/+/web/snippet/))'))
  assert.ok(!isPreviewCrawler('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'))
  assert.ok(!isPreviewCrawler('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'))
  assert.ok(!isPreviewCrawler('Mozilla/5.0 (compatible; bingbot/2.0)'))
  assert.ok(!isPreviewCrawler(undefined))
})

test('pickLocale: ?lang, then Accept-Language, then default', () => {
  const enabled = ['ro', 'en']
  assert.deepEqual(pickLocale({ lang: 'en', acceptLanguage: 'ro', enabled }), { locale: 'en', langParam: 'en' })
  assert.deepEqual(pickLocale({ lang: 'fr', acceptLanguage: 'en-US,en;q=0.9', enabled }), { locale: 'en', langParam: null })
  assert.deepEqual(pickLocale({ lang: '<x>', enabled }), { locale: 'ro', langParam: null })
  assert.deepEqual(pickLocale({ acceptLanguage: 'de;q=1, en;q=0.5', enabled }), { locale: 'en', langParam: null })
  assert.deepEqual(pickLocale({ acceptLanguage: 'en;q=0.4, ro;q=0.8', enabled }), { locale: 'ro', langParam: null })
  assert.deepEqual(pickLocale({ enabled }), { locale: 'ro', langParam: null })
})

test('title chain: data.title, else the share name; never event text or Poster name', () => {
  assert.equal(buildPreview(input()).title, 'Seara de rugăciune')
  const untitled = buildPreview(input({
    item: { type: 'card', data: { startDate: '2026-11-14', location: 'Sala mare', thumbnail: `/uploads/${UUID}.webp` } },
  }))
  assert.equal(untitled.title, 'Biserica Baptistă Betel')
  const poster = buildPreview(input({ item: { type: 'poster', data: { name: 'Afiș intern', imageUrl: `/uploads/${UUID}.webp` } } }))
  assert.equal(poster.title, 'Biserica Baptistă Betel')
  const site = buildPreview(input({ site: { name: 'Centru' }, item: { type: 'poster', data: { imageUrl: `/uploads/${UUID}.webp` } } }))
  assert.equal(site.siteName, 'Centru · Biserica Baptistă Betel')
  assert.equal(site.title, 'Centru · Biserica Baptistă Betel')
})

test('description chain: authored text unchanged, else when · location, else none', () => {
  const card = (data: Record<string, unknown>) => buildPreview(input({ item: { type: 'card', data: { title: 'T', ...data } } }))
  assert.equal(card({ description: 'Vino cu prietenii.', startDate: '2026-11-14', location: 'Sala mare' }).description, 'Vino cu prietenii.')
  assert.equal(
    card({ startDate: '2026-11-14', startTime: '18:00', location: 'Sala mare' }).description,
    'sâmbătă, 14 noiembrie 2026, 18:00 · Sala mare',
  )
  assert.equal(card({ startDate: '2026-11-14' }).description, 'sâmbătă, 14 noiembrie 2026')
  assert.equal(card({ location: 'Sala mare' }).description, 'Sala mare')
  assert.equal(card({}).description, null)
  const long = card({ description: 'cuvânt '.repeat(60) }).description!
  assert.ok(long.length <= 200 && long.endsWith('…'))
  const html = renderPreviewHtml(card({}))
  assert.ok(!html.includes('og:description'))
  assert.ok(!html.includes('twitter:description'))
})

test('eligibility: own title or own image; brand images never make an item previewable', () => {
  const noImage = buildPreview(input({ itemImage: null, item: { type: 'card', data: { title: 'Doar titlu' } } }))
  assert.equal(noImage.willPreview, true)
  assert.equal(noImage.imageUrl, 'https://hub.test/uploads/og/brand-111111.jpg')
  const empty = buildPreview(input({ itemImage: null, item: { type: 'card', data: {} } }))
  assert.deepEqual([empty.willPreview, empty.reason], [false, 'no-title-no-image'])
  const richtext = buildPreview(input({ itemImage: null, item: { type: 'richtext', data: { title: 'Text', body: 'x' } } }))
  assert.deepEqual([richtext.willPreview, richtext.reason], [false, 'no-title-no-image'])
  assert.equal(buildPreview(input({ item: null })).reason, 'item-missing')
  const destination = buildPreview(input({ mode: 'destination' }))
  assert.deepEqual([destination.willPreview, destination.reason], [false, 'mode-destination'])
})

test('url: absolute short URL, keeps ?lang, never preview=1', () => {
  assert.equal(buildPreview(input()).url, 'https://hub.test/s/abc123')
  assert.equal(buildPreview(input({ locale: 'en', langParam: 'en' })).url, 'https://hub.test/s/abc123?lang=en')
  const html = renderPreviewHtml(buildPreview(input({ locale: 'en', langParam: 'en' })))
  assert.ok(html.includes('<meta property="og:url" content="https://hub.test/s/abc123?lang=en">'))
  assert.ok(html.includes('<link rel="canonical" href="https://hub.test/s/abc123?lang=en">'))
  assert.ok(!html.includes('preview=1'))
})

test('og:locale: mapped codes only', () => {
  assert.ok(renderPreviewHtml(buildPreview(input())).includes('<meta property="og:locale" content="ro_RO">'))
  assert.ok(!renderPreviewHtml(buildPreview(input({ locale: 'xx' }))).includes('og:locale'))
})

test('html: escaped values, safe destination, no redirect, small head', () => {
  const html = renderPreviewHtml(buildPreview(input({
    item: { type: 'card', data: { title: 'A & B <script>"x"</script>', description: '1 < 2 & "3"' } },
    destination: 'javascript:alert(1)',
  })))
  assert.ok(html.includes('A &amp; B &lt;script&gt;&quot;x&quot;&lt;/script&gt;'))
  assert.ok(html.includes('1 &lt; 2 &amp; &quot;3&quot;'))
  assert.ok(!html.includes('<script'))
  assert.ok(html.includes('<a href="/" rel="noopener">'))
  assert.ok(!/http-equiv/i.test(html))
  for (const tag of ['og:image:secure_url', 'og:image:type" content="image/jpeg', 'og:image:width" content="1200', 'twitter:card" content="summary_large_image', 'noindex, nofollow']) {
    assert.ok(html.includes(tag), tag)
  }
  const head = html.slice(0, html.indexOf('</head>'))
  assert.ok(Buffer.byteLength(head) < 8 * 1024)
  assert.equal(safeDestination('/i/1'), '/i/1')
  assert.equal(safeDestination('//evil.test'), '/')
  assert.equal(safeDestination(null), '/')
})

test('preview-image chain helpers', () => {
  assert.equal(itemImageUrl('card', { thumbnail: `/uploads/${UUID}.webp` }), `/uploads/${UUID}.webp`)
  assert.equal(itemImageUrl('poster', { imageUrl: `/uploads/${UUID}.webp` }), `/uploads/${UUID}.webp`)
  assert.equal(itemImageUrl('card', { thumbnail: 'https://cdn.test/x.jpg' }), null)
  assert.equal(itemImageUrl('richtext', { thumbnail: `/uploads/${UUID}.webp` }), null)
  assert.equal(ogDerivativePath(`/uploads/${UUID}.webp`), `/uploads/og/${UUID}.jpg`)
  assert.equal(ogDerivativePath('/uploads/../etc/passwd'), null)
  assert.equal(brandDerivativePath(null), '/uploads/og/brand-111111.jpg')
  assert.equal(brandDerivativePath('#17D3C3'), '/uploads/og/brand-17d3c3.jpg')
  assert.equal(accentHex('#f60'), 'ff6600')
  assert.equal(accentHex('red'), '111111')
})

test('og-image: derivative is a 1.91:1 JPEG within the size bound, even for noise', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'og-'))
  try {
    // Worst case for JPEG: random noise at the upload maximum width.
    const width = 1980
    const height = 2800
    const noise = Buffer.alloc(width * height * 3)
    for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(Math.random() * 256)
    await sharp(noise, { raw: { width, height, channels: 3 } }).webp({ quality: 82 }).toFile(join(dir, `${UUID}.webp`))
    const logo = join(dir, 'logo.png')
    writeFileSync(logo, await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffff' } }).png().toBuffer())
    configureOgImages({ uploadsDir: dir, brandSources: [logo] })

    const [image, again] = await Promise.all([ensureOgImage(`${UUID}.jpg`), ensureOgImage(`${UUID}.jpg`)])
    assert.ok(image)
    assert.deepEqual(again, image)
    const file = readFileSync(join(dir, 'og', `${UUID}.jpg`))
    assert.ok(file.length <= OG_MAX_BYTES, `${file.length} bytes`)
    const meta = await sharp(file).metadata()
    assert.equal(meta.format, 'jpeg')
    assert.deepEqual([meta.width, meta.height], [image.width, image.height])
    assert.ok(Math.abs(image.width / image.height - 1.905) < 0.01)

    const brand = await ensureOgImage('brand-17d3c3.jpg')
    assert.deepEqual(brand, { name: 'brand-17d3c3.jpg', width: 1200, height: 630 })
    // The (white) logo is centred on the accent background.
    const { data } = await sharp(join(dir, 'og', 'brand-17d3c3.jpg')).raw().toBuffer({ resolveWithObject: true })
    const red = (x: number, y: number) => data[(y * 1200 + x) * 3]
    assert.ok(red(600, 315) > 240, 'centre is logo')
    assert.ok(red(20, 20) < 40 && red(1180, 610) < 40, 'corners are background')
    assert.ok(red(300, 315) < 40 && red(900, 315) < 40, 'logo does not reach the side margins')
    assert.equal(await ensureOgImage('../secret.jpg'), null)
    assert.equal(await ensureOgImage('00000000-0000-4000-8000-000000000000.jpg'), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
