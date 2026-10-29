import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyLocation, sanitizeTranslatedLocation } from './event-location.js'

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
