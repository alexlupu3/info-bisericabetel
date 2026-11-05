import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SECTION_PREVIEW_SIZE, deckOrder, groupSlug, isCollapsibleGroup, previewSlots, tileDate, tileTint } from './section-preview.js'

const group = (pins: boolean[]) => pins.map(pinnedInGroup => ({ pinnedInGroup }))

test('the deck shows 2 cards', () => {
  assert.equal(SECTION_PREVIEW_SIZE, 2)
})

test('isCollapsibleGroup: more than 3 items and the group switch on', () => {
  assert.equal(isCollapsibleGroup(0), false)
  assert.equal(isCollapsibleGroup(3), false)
  assert.equal(isCollapsibleGroup(4), true)
  assert.equal(isCollapsibleGroup(9), true)
  assert.equal(isCollapsibleGroup(9, false), false)
})

test('group of 3 or an opted-out group has no slots; group of 4 has 2', () => {
  assert.deepEqual(previewSlots(group([false, false, false])), [])
  assert.deepEqual(previewSlots(group([true, false, false])), [])
  assert.deepEqual(previewSlots(group([false, false, false, false]), 0, false), [])
  assert.deepEqual(previewSlots(group([false, false, false, false])), [0, 1])
})

test('deck order: pinned items first in group order, then the rest', () => {
  assert.deepEqual(deckOrder(group([false, false, false, false, false])), [0, 1, 2, 3, 4])
  assert.deepEqual(deckOrder(group([false, false, false, false, true])), [4, 0, 1, 2, 3])
  assert.deepEqual(deckOrder(group([false, true, false, false, true])), [1, 4, 0, 2, 3])
})

test('a pinned last item tops the deck', () => {
  assert.deepEqual(previewSlots(group([false, false, false, false, true])), [4, 0])
})

test('swiping walks the deck order and wraps around', () => {
  const g = group([false, true, false, false, false])
  assert.deepEqual(previewSlots(g, 1), [0, 2])
  assert.deepEqual(previewSlots(g, 3), [3, 4])
  assert.deepEqual(previewSlots(g, 4), [4, 1])
  assert.deepEqual(previewSlots(g, 5), [1, 0])
  assert.deepEqual(previewSlots(g, -1), [4, 1])
})

test('missing pinnedInGroup is treated as false', () => {
  assert.deepEqual(previewSlots([{}, {}, { pinnedInGroup: true }, {}]), [2, 0])
  assert.deepEqual(previewSlots([{}, {}, {}, {}]), [0, 1])
})

test('groupSlug strips diacritics and punctuation', () => {
  assert.equal(groupSlug('Fii parte din comunitate'), 'fii-parte-din-comunitate')
  assert.equal(groupSlug('Tabără de iarnă!'), 'tabara-de-iarna')
})

test('tileDate reads startDate, falls back to legacy date', () => {
  const nov4 = new Date(Date.UTC(2026, 10, 4))
  assert.deepEqual(tileDate({ startDate: '2026-11-04' }), {
    day: '4',
    month: new Intl.DateTimeFormat('ro-RO', { month: 'long', timeZone: 'UTC' }).format(nov4),
  })
  assert.equal(tileDate({ date: '2026-12-24' })?.day, '24')
  assert.equal(tileDate({}), null)
  assert.equal(tileDate({ startDate: 'soon' }), null)
})

test('tileTint uses the accent of a single-site item, otherwise neutral', () => {
  const sites = [{ slug: 'a', accent: '#ff6200' }, { slug: 'b', accent: 'red;background:url(x)' }]
  assert.equal(tileTint(['a'], sites), '#ff6200')
  assert.equal(tileTint([], sites), null)
  assert.equal(tileTint(['a', 'b'], sites), null)
  assert.equal(tileTint(['b'], sites), null)
  assert.equal(tileTint(['missing'], sites), null)
})
