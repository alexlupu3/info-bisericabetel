import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invalidContentData, missingRequiredField } from './content-validation.js'

test('missingRequiredField rejects an empty or blank required field', () => {
  assert.match(missingRequiredField('card', { title: '' }) ?? '', /title is required/)
  assert.match(missingRequiredField('card', { title: '   ' }) ?? '', /title is required/)
  assert.equal(missingRequiredField('card', { title: 'Seară de rugăciune' }), null)
  assert.equal(missingRequiredField('unknown', {}), null)
})

test('invalidContentData rejects a reversed date range on the merged data', () => {
  // Regression: a PATCH that moves startDate past the stored endDate.
  const stored = { title: 'Conferință', startDate: '2026-11-10', endDate: '2026-11-12' }
  const merged = { ...stored, startDate: '2026-11-20' }
  assert.equal(invalidContentData('card', merged), 'endDate must not be before startDate')
  assert.equal(invalidContentData('card', stored), null)
  assert.equal(invalidContentData('card', { ...stored, endDate: stored.startDate }), null)
})

test('invalidContentData checks required field, dates and start time in that order', () => {
  assert.match(invalidContentData('card', { title: '', startDate: 'x' }) ?? '', /title is required/)
  assert.match(invalidContentData('card', { title: 'A', startDate: '2026-02-30' }) ?? '', /startDate must be a calendar date/)
  assert.match(invalidContentData('card', { title: 'A', startDate: '2026-11-10', endDate: '2026-11-11', startTime: '18:00' }) ?? '',
    /single-day/)
  assert.equal(invalidContentData('card', { title: 'A', startDate: '2026-11-10', startTime: '18:00' }), null)
})
