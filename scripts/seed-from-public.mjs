#!/usr/bin/env node
// ─── Seed a local environment from the PUBLIC live website ───────────────────
//
//   node scripts/seed-from-public.mjs <dev|staging> [--base URL] [--yes]
//   pnpm seed:public:dev       pnpm seed:public:staging
//
// For when there is no database access: rebuilds local content from what the
// public API exposes. Only GET requests are sent to live.
//
// Copied: sites, enabled languages, UI translations, every currently visible
// published item (all-sites view + each site, so site-exclusive items are
// included), their groups, content/group translations, and referenced
// /uploads/* images (also registered in the media library).
//
// Not available publicly, so not copied: drafts, archived/expired items,
// users, analytics, audit log, short links, group site scopes. Group root
// positions are reconstructed from the public ordering.
//
// Local users, analytics, audit and error logs are kept; all content, groups,
// media rows, translations (incl. UI strings) and short links are replaced.
// The target database must already be migrated (start the API once).
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const target = args[0]
const flag = name => args.includes(name)
const opt = name => { const i = args.indexOf(name); return i > 0 ? args[i + 1] : undefined }

if (target !== 'dev' && target !== 'staging') {
  console.error('usage: node scripts/seed-from-public.mjs <dev|staging> [--base URL] [--yes]')
  process.exit(1)
}
const BASE = (opt('--base') ?? process.env.LIVE_PUBLIC_URL ?? 'https://info.bisericabetel.com').replace(/\/$/, '')
const composeFile = target === 'dev' ? 'docker-compose.yml' : 'docker-compose.staging.yml'
const compose = (...a) => execFileSync('docker', ['compose', '-f', composeFile, ...a], { cwd: ROOT, encoding: 'utf8' })
const log = msg => console.log(`==> ${msg}`)

async function getJson(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

// ─── 1. Fetch everything public ──────────────────────────────────────────────
log(`Reading ${BASE}`)
const { sites } = await getJson('/api/sites')
const { languages } = await getJson('/api/languages')
const defaultLocale = languages.find(l => l.isDefault)?.code ?? 'ro'
const views = [null, ...sites.map(s => s.slug)]
const viewQuery = (site, locale) => {
  const qs = new URLSearchParams()
  if (site) qs.set('site', site)
  if (locale) qs.set('locale', locale)
  return `/api/content${qs.size ? `?${qs}` : ''}`
}

const viewLists = []
for (const site of views) viewLists.push((await getJson(viewQuery(site))).items)

const items = new Map()
const groupTitles = new Map()
for (const list of viewLists) {
  for (const it of list) {
    items.set(it.id, it)
    if (it.groupId) groupTitles.set(it.groupId, it.groupTitle ?? 'Grup')
  }
}

// ─── 2. Reconstruct root ordering ────────────────────────────────────────────
// The API sorts by COALESCE(group.orderPosition, item.orderPosition), then
// item.orderPosition. Group positions are not exposed, so place each group
// right after the last standalone item that precedes it in any view.
const groupKey = new Map()
const firstSeen = new Map()
let seenCounter = 0
for (const list of viewLists) {
  let lastStandalone = -1
  for (const it of list) {
    if (!it.groupId) { lastStandalone = it.orderPosition; continue }
    if (!firstSeen.has(it.groupId)) firstSeen.set(it.groupId, seenCounter++)
    groupKey.set(it.groupId, Math.max(groupKey.get(it.groupId) ?? -1, lastStandalone))
  }
}
const roots = [
  ...[...items.values()].filter(it => !it.groupId).map(it => ({ kind: 'item', id: it.id, key: it.orderPosition, tie: 0 })),
  ...[...groupKey].map(([id, k]) => ({ kind: 'group', id, key: k + 0.5, tie: firstSeen.get(id) })),
].sort((a, b) => a.key - b.key || a.tie - b.tie)
const rootPosition = new Map(roots.map((r, i) => [r.id, i]))

// ─── 3. Translations ─────────────────────────────────────────────────────────
const uiTranslations = []
for (const { code } of languages) {
  const { translations } = await getJson(`/api/translations?locale=${encodeURIComponent(code)}`)
  for (const [key, value] of Object.entries(translations)) uiTranslations.push({ locale: code, key, value })
}

const contentTranslations = new Map() // `${id}|${locale}` → partial data
const groupTranslations = new Map()   // `${groupId}|${locale}` → title
for (const { code } of languages.filter(l => l.code !== defaultLocale)) {
  for (const site of views) {
    for (const it of (await getJson(viewQuery(site, code))).items) {
      const source = items.get(it.id)?.data ?? {}
      const diff = Object.fromEntries(Object.entries(it.data ?? {})
        .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(source[k])))
      if (Object.keys(diff).length) contentTranslations.set(`${it.id}|${code}`, diff)
      if (it.groupId && it.groupTitle && it.groupTitle !== groupTitles.get(it.groupId)) {
        groupTranslations.set(`${it.groupId}|${code}`, it.groupTitle)
      }
    }
  }
}

// ─── 4. Images ───────────────────────────────────────────────────────────────
const uploadPaths = new Set()
// Translations store only the fields that differ, so they can reference their own images.
for (const data of [...[...items.values()].map(it => it.data), ...contentTranslations.values()]) {
  for (const m of JSON.stringify(data).matchAll(/\/uploads\/([A-Za-z0-9._-]+)/g)) uploadPaths.add(m[1])
}
const tmp = mkdtempSync(join(ROOT, '.local-public-'))
const mediaRows = []
try {
  for (const filename of uploadPaths) {
    const res = await fetch(`${BASE}/uploads/${filename}`)
    // Missing files are skipped; anything else (429, 5xx, ...) aborts before the target is touched.
    if (res.status === 404 || res.status === 410) { console.warn(`    skip /uploads/${filename} (${res.status})`); continue }
    if (!res.ok) throw new Error(`GET /uploads/${filename} → ${res.status}; nothing was written, retry later`)
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(join(tmp, filename), buf)
    mediaRows.push({ url: `/uploads/${filename}`, filename, size: buf.length, mimeType: res.headers.get('content-type') ?? '' })
  }

  console.log(`    ${sites.length} sites, ${languages.length} languages, ${items.size} items, ${groupTitles.size} groups, ` +
    `${mediaRows.length} images, ${uiTranslations.length} UI strings, ${contentTranslations.size} content translations`)

  if (!flag('--yes') && !flag('-y')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(`\nThis REPLACES all content, groups, media and translations in the local ${target} database. Continue? [y/N] `)
    rl.close()
    if (!/^y$/i.test(answer.trim())) { console.error('aborted'); process.exit(1) }
  }

  // ─── 5. Write the database ─────────────────────────────────────────────────
  const q = v => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`
  const arr = a => `ARRAY[${(a ?? []).map(q).join(',')}]::text[]`
  const json = v => `${q(JSON.stringify(v ?? {}))}::jsonb`
  // /api/sites key → sites column. Quoted literals coerce to the column type (text,
  // double precision, timestamptz); keys missing on an older live API become NULL.
  const SITE_COLUMNS = {
    slug: 'slug', name: 'name', accent: 'accent', address: 'address',
    streetAddress: 'street_address', postalCode: 'postal_code', addressLocality: 'address_locality',
    addressRegion: 'address_region', addressCountry: 'address_country', latitude: 'latitude',
    longitude: 'longitude', telephone: 'telephone', email: 'email', createdAt: 'created_at',
  }
  const siteCols = Object.values(SITE_COLUMNS)
  const siteUpdate = siteCols.filter(c => c !== 'slug' && c !== 'created_at').map(c => `${c} = EXCLUDED.${c}`).join(', ')

  const sql = [
    'BEGIN;',
    'DELETE FROM content_translations; DELETE FROM group_translations; DELETE FROM ui_translations; DELETE FROM short_links;',
    'DELETE FROM content_items; DELETE FROM groups; DELETE FROM media;',
    ...sites.map(s => `INSERT INTO sites (${siteCols.join(', ')}) VALUES (${Object.keys(SITE_COLUMNS).map(k => q(s[k])).join(', ')})
      ON CONFLICT (slug) DO UPDATE SET ${siteUpdate};`),
    `DELETE FROM sites WHERE slug NOT IN (${sites.map(s => q(s.slug)).join(',')});`,
    ...languages.map(l => `INSERT INTO languages (code, name, is_default, enabled, created_at) VALUES (${q(l.code)}, ${q(l.name)}, ${l.isDefault}, true, ${q(l.createdAt)})
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_default = EXCLUDED.is_default, enabled = true;`),
    // Languages that are not public on live become disabled locally rather than deleted.
    `UPDATE languages SET enabled = false, is_default = false WHERE code NOT IN (${languages.map(l => q(l.code)).join(',')});`,
    ...uiTranslations.map(t => `INSERT INTO ui_translations (locale, key, value) VALUES (${q(t.locale)}, ${q(t.key)}, ${q(t.value)});`),
    ...[...groupTitles].map(([id, title]) => `INSERT INTO groups (id, title, order_position, state) VALUES (${q(id)}, ${q(title)}, ${rootPosition.get(id)}, 'published');`),
    ...[...items.values()].map(it => `INSERT INTO content_items (id, type, state, sites, exclusive_site, order_position, group_id, expires_at, data, created_at, updated_at)
      VALUES (${q(it.id)}, ${q(it.type)}, ${q(it.state)}, ${arr(it.sites)}, ${q(it.exclusiveSite)}, ${it.groupId ? it.orderPosition : rootPosition.get(it.id)},
        ${q(it.groupId)}, ${q(it.expiresAt)}, ${json(it.data)}, ${q(it.createdAt)}, ${q(it.updatedAt)});`),
    ...[...contentTranslations].map(([k, data]) => { const [id, locale] = k.split('|'); return `INSERT INTO content_translations (content_item_id, locale, data) VALUES (${q(id)}, ${q(locale)}, ${json(data)});` }),
    ...[...groupTranslations].map(([k, title]) => { const [id, locale] = k.split('|'); return `INSERT INTO group_translations (group_id, locale, title) VALUES (${q(id)}, ${q(locale)}, ${q(title)});` }),
    ...mediaRows.map(m => `INSERT INTO media (url, filename, original_name, size, mime_type) VALUES (${q(m.url)}, ${q(m.filename)}, ${q(m.filename)}, ${m.size}, ${q(m.mimeType)});`),
    'COMMIT;',
  ].join('\n')

  log(`Writing ${target} database`)
  compose('up', '-d', '--wait', 'db')
  const migrated = compose('exec', '-T', 'db', 'psql', '-U', 'betel', '-d', 'info_bisericabetel', '-tAc',
    "select to_regclass('public._migrations') is not null").trim()
  if (migrated !== 't') throw new Error(`the ${target} database is not migrated yet: start the API once (${target === 'dev' ? 'pnpm dev:api' : 'pnpm staging:up'})`)
  execFileSync('docker', ['compose', '-f', composeFile, 'exec', '-T', 'db', 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'betel', '-d', 'info_bisericabetel'],
    { cwd: ROOT, input: sql, stdio: ['pipe', 'inherit', 'inherit'] })

  // ─── 6. Write the images ───────────────────────────────────────────────────
  log(`Writing ${mediaRows.length} images`)
  if (target === 'dev') {
    // Same default as packages/api/src/index.ts when started via `pnpm dev:api`.
    // A relative UPLOADS_DIR is resolved against packages/api, the API's cwd.
    const uploads = resolve(ROOT, 'packages', 'api', process.env.UPLOADS_DIR || '../uploads')
    mkdirSync(uploads, { recursive: true })
    for (const f of readdirSync(uploads)) unlinkSync(join(uploads, f))
    for (const m of mediaRows) execFileSync('cp', [join(tmp, m.filename), join(uploads, m.filename)])
  } else {
    // Pre-create the volume with compose labels so `docker compose up` adopts it.
    execFileSync('docker', ['volume', 'create', '--label', 'com.docker.compose.project=betel-staging',
      '--label', 'com.docker.compose.volume=uploads', 'betel-staging_uploads'], { stdio: 'ignore' })
    execFileSync('docker', ['run', '--rm', '-v', 'betel-staging_uploads:/u', '-v', `${tmp}:/src:ro`, 'alpine:3',
      'sh', '-c', 'find /u -mindepth 1 -delete && cp -a /src/. /u/'], { stdio: 'inherit' })
  }
  log(`Done. Open ${target === 'dev' ? 'http://localhost:5173' : `http://localhost:${process.env.STAGING_APP_PORT || 8080}`}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
