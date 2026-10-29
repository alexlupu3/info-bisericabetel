import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemWhen, pageTitle, siteAddressLine, stripMarkdown, truncateText, BOT_USER_AGENT_PATTERN } from './seo.js'

test('pageTitle follows the spec 03 rules', () => {
  const names = { siteName: 'Betel Info', orgName: 'Biserica Baptistă Betel' }
  assert.equal(pageTitle({ kind: 'hub' }, names), 'Betel Info – Biserica Baptistă Betel')
  assert.equal(pageTitle({ kind: 'site', siteName: 'Centru' }, names), 'Centru – Biserica Baptistă Betel')
  assert.equal(pageTitle({ kind: 'item', title: 'Concert', siteName: null }, names), 'Concert – Biserica Baptistă Betel')
  assert.equal(pageTitle({ kind: 'item', title: 'Concert', siteName: 'Vest' }, names), 'Concert – Vest')
})

test('stripMarkdown keeps the text only', () => {
  assert.equal(stripMarkdown('# Titlu\n\n**Bold** and _it_ [link](https://x) ![img](a.png)\n- one\n- two'), 'Titlu Bold and it link img one two')
})

test('truncateText cuts on a word boundary', () => {
  assert.equal(truncateText('short', 300), 'short')
  const out = truncateText('cuvânt '.repeat(100), 30)
  assert.ok(out.length <= 30)
  assert.ok(out.endsWith('cuvânt…'))
})

test('siteAddressLine prefers structured fields, else free text', () => {
  assert.equal(siteAddressLine({ address: 'Str. X 1' }), 'Str. X 1')
  assert.equal(siteAddressLine({ address: 'Str. X 1', streetAddress: 'Str. Y 2', postalCode: '400', addressLocality: 'Cluj' }), 'Str. Y 2, 400 Cluj')
  assert.equal(siteAddressLine({}), null)
})

test('itemWhen: dateTime for single-day events only', () => {
  assert.deepEqual(itemWhen({ startDate: '2099-11-14', startTime: '18:00' }, 'ro-RO'), { text: '14 noiembrie · 18:00', dateTime: '2099-11-14T18:00:00+02:00' })
  assert.equal(itemWhen({ startDate: '2099-11-14', endDate: '2099-11-16' }, 'ro-RO')!.dateTime, null)
  assert.equal(itemWhen({}, 'ro-RO'), null)
})

test('bot user agents are recognised', () => {
  assert.ok(BOT_USER_AGENT_PATTERN.test('Mozilla/5.0 (compatible; Googlebot/2.1)'))
  assert.ok(BOT_USER_AGENT_PATTERN.test('Mozilla/5.0 (compatible; GPTBot/1.0)'))
  assert.ok(!BOT_USER_AGENT_PATTERN.test('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'))
})
