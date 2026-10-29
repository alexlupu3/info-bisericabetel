import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOCATION_MAX_LENGTH, invalidLocation, normalizeLocationText, readLocation } from './event-location.js'

const LENGTH = 'location must be at most 70 characters'

test('normalizeLocationText trims and collapses whitespace runs', () => {
  assert.equal(normalizeLocationText('  Sala mare  '), 'Sala mare')
  assert.equal(normalizeLocationText('Sala\n\t mare'), 'Sala mare')
  assert.equal(normalizeLocationText('Sala\u00A0\u00A0mare'), 'Sala mare')
  assert.equal(normalizeLocationText('Sala\u2028mare'), 'Sala mare')
  assert.equal(normalizeLocationText('   \n\t '), '')
})

test('normalizeLocationText strips control characters', () => {
  assert.equal(normalizeLocationText('Sa\u0000la\u001B ma\u009Fre'), 'Sala mare')
  assert.equal(normalizeLocationText('Sala \u0000 mare'), 'Sala mare')
})

test('normalizeLocationText keeps diacritics and punctuation and never truncates', () => {
  assert.equal(normalizeLocationText('Mănăștur, str. Horea 12 — etaj 1'), 'Mănăștur, str. Horea 12 — etaj 1')
  const long = 'x'.repeat(200)
  assert.equal(normalizeLocationText(long), long)
})

test('invalidLocation accepts absent values and strings up to the limit', () => {
  assert.equal(invalidLocation(undefined), null)
  assert.equal(invalidLocation(null), null)
  assert.equal(invalidLocation(''), null)
  assert.equal(invalidLocation('x'.repeat(LOCATION_MAX_LENGTH)), null)
})

test('invalidLocation rejects non-strings', () => {
  for (const bad of [42, {}, [], true]) assert.equal(invalidLocation(bad), 'location must be a string')
})

test('invalidLocation measures UTF-16 code units after normalisation', () => {
  assert.equal(invalidLocation('x'.repeat(71)), LENGTH)
  assert.equal(invalidLocation(` ${'x'.repeat(70)} `), null)
  assert.equal(invalidLocation('a'.repeat(69) + '😀'), LENGTH)
})

test('readLocation returns the normalised, non-empty location or null', () => {
  assert.equal(readLocation({ location: '  Sala mare ' }), 'Sala mare')
  for (const data of [{ location: '' }, { location: '   ' }, { location: null }, {}, undefined, null, { location: 5 }]) {
    assert.equal(readLocation(data as Record<string, unknown> | null | undefined), null)
  }
})
