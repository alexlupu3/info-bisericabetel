import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyLocation, mergePartialTranslation, sanitizeTranslatedLocation } from './event-location.js'

test('applyLocation normalises a card location in place', () => {
  const data: Record<string, unknown> = { title: 'A', location: '  Sala\n mare  ' }
  assert.equal(applyLocation('card', data), null)
  assert.equal(data.location, 'Sala mare')
})

test('applyLocation removes empty input on any type', () => {
  for (const location of [null, undefined, '', '   ']) {
    for (const type of ['card', 'poster']) {
      const data: Record<string, unknown> = { location }
      assert.equal(applyLocation(type, data), null)
      assert.equal('location' in data, false)
    }
  }
})

test('applyLocation leaves data without a location untouched', () => {
  const data = { imageUrl: '/uploads/a.webp' }
  assert.equal(applyLocation('poster', data), null)
  assert.deepEqual(data, { imageUrl: '/uploads/a.webp' })
})

test('applyLocation rejects non-strings, over-long values and non-card types, in that order', () => {
  assert.equal(applyLocation('poster', { location: 7 }), 'location must be a string')
  assert.equal(applyLocation('poster', { location: 'x'.repeat(71) }), 'location must be at most 70 characters')
  assert.equal(applyLocation('card', { location: 'x'.repeat(71) }), 'location must be at most 70 characters')
  assert.equal(applyLocation('poster', { location: 'Sala' }), 'location is only supported on cards')
  assert.equal(applyLocation('richtext', { location: 'Sala' }), 'location is only supported on cards')
})

test('sanitizeTranslatedLocation keeps valid values and drops invalid ones', () => {
  const warn = console.warn
  const logged: string[] = []
  console.warn = (msg: string) => { logged.push(msg) }
  try {
    const ok: Record<string, unknown> = { title: 'T', location: ' Main  hall ' }
    sanitizeTranslatedLocation(ok, 'id', 'en')
    assert.equal(ok.location, 'Main hall')

    for (const location of ['x'.repeat(71), 42, '  ']) {
      const bad: Record<string, unknown> = { title: 'T', location }
      sanitizeTranslatedLocation(bad, 'id', 'en')
      assert.deepEqual(bad, { title: 'T' })
    }
    assert.equal(logged.length, 3)
    assert.equal(JSON.parse(logged[0]).event, 'location_dropped')
  } finally {
    console.warn = warn
  }
})

test('mergePartialTranslation drops a stale translated location when no valid one came back', () => {
  const existing = { title: 'Youth night', location: 'Main hall' }
  // The model's location was rejected by sanitizeTranslatedLocation (or omitted).
  assert.deepEqual(mergePartialTranslation(existing, { title: 'Youth evening' }, ['title', 'location']), { title: 'Youth evening' })
  // A valid new translation replaces the old one.
  assert.deepEqual(mergePartialTranslation(existing, { location: 'Small hall' }, ['location']), { title: 'Youth night', location: 'Small hall' })
  // Location not requested: the stored translation is kept as is.
  assert.deepEqual(mergePartialTranslation(existing, { title: 'Youth evening' }, ['title']), { title: 'Youth evening', location: 'Main hall' })
})

test('a type change away from card is rejected while the merged data still has a location', () => {
  // PATCH { type: 'poster' } on a located card: the merged data keeps the stored location.
  const stored = { title: 'Picnic', imageUrl: '/uploads/a.webp', location: 'Parcul Central' }
  assert.equal(applyLocation('poster', { ...stored }), 'location is only supported on cards')
  // PATCH { type: 'poster', data: { location: null } }: the merge removes the key first.
  const { location: _cleared, ...cleared } = stored
  assert.equal(applyLocation('poster', cleared), null)
})
