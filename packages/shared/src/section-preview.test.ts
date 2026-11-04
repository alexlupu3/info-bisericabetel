import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SECTION_PREVIEW_SIZE, groupSlug, isCollapsibleGroup, previewSlots, tileDate } from './section-preview.js'

const group = (pins: boolean[]) => pins.map(pinnedInGroup => ({ pinnedInGroup }))

test('preview size is 3', () => {
  assert.equal(SECTION_PREVIEW_SIZE, 3)
})

test('isCollapsibleGroup: only groups with more than 3 items', () => {
  assert.equal(isCollapsibleGroup(0), false)
  assert.equal(isCollapsibleGroup(3), false)
  assert.equal(isCollapsibleGroup(4), true)
  assert.equal(isCollapsibleGroup(9), true)
})

test('group of 3 has no slots; group of 4 has 3', () => {
  assert.deepEqual(previewSlots(group([false, false, false])), [])
  assert.deepEqual(previewSlots(group([true, false, false])), [])
  assert.deepEqual(previewSlots(group([false, false, false, false])), [0, 1, 2])
})

test('no pins: first three in group order', () => {
  assert.deepEqual(previewSlots(group([false, false, false, false, false])), [0, 1, 2])
})

test('one pin at the end leads the hand', () => {
  assert.deepEqual(previewSlots(group([false, false, false, false, true])), [4, 0, 1])
})

test('two pins lead in group order', () => {
  assert.deepEqual(previewSlots(group([false, true, false, false, true])), [1, 4, 0])
})

test('four pins: the first three pinned in group order win', () => {
  assert.deepEqual(previewSlots(group([false, true, true, true, true])), [1, 2, 3])
})

test('missing pinnedInGroup is treated as false', () => {
  assert.deepEqual(previewSlots([{}, {}, { pinnedInGroup: true }, {}]), [2, 0, 1])
  assert.deepEqual(previewSlots([{}, {}, {}, {}]), [0, 1, 2])
})

test('groupSlug strips diacritics and punctuation', () => {
  assert.equal(groupSlug('Fii parte din comunitate'), 'fii-parte-din-comunitate')
  assert.equal(groupSlug('Tabără de iarnă!'), 'tabara-de-iarna')
})

test('tileDate reads startDate, falls back to legacy date', () => {
  assert.deepEqual(tileDate({ startDate: '2026-11-04' }), { day: '4', month: new Intl.DateTimeFormat('ro-RO', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 4))) })
  assert.equal(tileDate({ date: '2026-12-24' })?.day, '24')
  assert.equal(tileDate({}), null)
  assert.equal(tileDate({ startDate: 'soon' }), null)
})
