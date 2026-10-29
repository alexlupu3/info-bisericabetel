import { test } from 'node:test'
import assert from 'node:assert/strict'
import { siteUpdates } from './site-updates.js'

const located = { latitude: 46.77, longitude: 23.59 }
const unlocated = { latitude: null, longitude: null }

test('siteUpdates rejects a patch that would leave half a coordinate pair (regression)', () => {
  // Clearing one stored coordinate, or setting one on a site without coordinates.
  assert.deepEqual(siteUpdates({ latitude: null }, located), { error: 'latitude and longitude must be set together' })
  assert.deepEqual(siteUpdates({ longitude: '' }, located), { error: 'latitude and longitude must be set together' })
  assert.deepEqual(siteUpdates({ latitude: 46.7 }, unlocated), { error: 'latitude and longitude must be set together' })
  assert.deepEqual(siteUpdates({ latitude: 46.7, longitude: null }, located), { error: 'latitude and longitude must be set together' })
})

test('siteUpdates accepts complete pairs and single-coordinate moves', () => {
  assert.deepEqual(siteUpdates({ latitude: '46,8' }, located), { updates: { latitude: 46.8 } })
  assert.deepEqual(siteUpdates({ latitude: null, longitude: null }, located), { updates: { latitude: null, longitude: null } })
  assert.deepEqual(siteUpdates({ latitude: 1, longitude: 2 }, unlocated), { updates: { latitude: 1, longitude: 2 } })
  assert.deepEqual(siteUpdates({ name: 'Betel' }, unlocated), { updates: { name: 'Betel' } })
})

test('siteUpdates validates coordinate ranges', () => {
  assert.match((siteUpdates({ latitude: 91, longitude: 0 }, unlocated) as { error: string }).error, /latitude/)
})
