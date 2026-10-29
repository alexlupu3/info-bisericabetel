import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareEventSchedules, eventSortKey, eventStartInstant, eventStartIso, formatEventTime,
  formatEventWhen, invalidStartTime, isClockTime, isSingleDayEvent, utcOffsetAt,
} from './event-time.js'

// ICU may separate "6:00" and "PM" with a narrow no-break space (U+202F).
const plain = (s: string | null) => s?.replace(/ | /g, ' ') ?? null

test('isClockTime accepts canonical HH:mm only', () => {
  for (const ok of ['00:00', '23:59', '09:05']) assert.equal(isClockTime(ok), true, ok)
  for (const bad of ['24:00', '9:05', '18:00:00', '', '18.00', '6pm', 1800, null, undefined]) {
    assert.equal(isClockTime(bad), false, String(bad))
  }
})

test('isSingleDayEvent', () => {
  assert.equal(isSingleDayEvent({ startDate: '2026-11-14' }), true)
  assert.equal(isSingleDayEvent({ startDate: '2026-11-14', endDate: '2026-11-14' }), true)
  assert.equal(isSingleDayEvent({ startDate: '2026-11-14', endDate: '2026-11-16' }), false)
  assert.equal(isSingleDayEvent({}), false)
})

test('invalidStartTime returns the fixed messages in order of precedence', () => {
  assert.equal(invalidStartTime({ startTime: undefined }), null)
  assert.equal(invalidStartTime({ startTime: null, endDate: '2026-11-16' }), null)
  assert.equal(invalidStartTime({ startDate: '2026-11-14', startTime: '18:00' }), null)
  assert.equal(invalidStartTime({ startDate: '2026-11-14', endDate: '2026-11-14', startTime: '18:00' }), null)
  const format = 'startTime must be a 24-hour clock time in HH:mm format'
  for (const bad of ['', '18:00:00', '6pm']) {
    assert.equal(invalidStartTime({ startDate: '2026-11-14', startTime: bad }), format)
  }
  // Format is checked before the date rules.
  assert.equal(invalidStartTime({ startTime: '6pm' }), format)
  assert.equal(invalidStartTime({ startTime: '18:00' }), 'startTime requires startDate')
  assert.equal(invalidStartTime({ startTime: '18:00', endDate: '2026-11-16' }), 'startTime requires startDate')
  assert.equal(
    invalidStartTime({ startDate: '2026-11-14', endDate: '2026-11-16', startTime: '18:00' }),
    'startTime is only allowed for single-day events (no endDate, or endDate equal to startDate)',
  )
})

test('eventStartIso uses the Bucharest offset, DST-aware', () => {
  assert.equal(eventStartIso('2026-11-14', '18:00'), '2026-11-14T18:00:00+02:00')
  assert.equal(eventStartIso('2026-07-01', '09:30'), '2026-07-01T09:30:00+03:00')
  // Spring-forward gap: 03:30 does not exist, resolves one hour later.
  assert.equal(eventStartIso('2026-03-29', '03:30'), '2026-03-29T04:30:00+03:00')
  // Autumn overlap: 03:30 happens twice, resolves to the later (standard-time) instant.
  assert.equal(eventStartIso('2026-10-25', '03:30'), '2026-10-25T03:30:00+02:00')
  assert.equal(eventStartIso('2026-11-14'), '2026-11-14')
  assert.equal(eventStartIso('2026-11-14', null), '2026-11-14')
})

test('eventStartInstant returns the instant, start of day when untimed', () => {
  assert.equal(eventStartInstant('2026-11-14').toISOString(), '2026-11-13T22:00:00.000Z')
  assert.equal(eventStartInstant('2026-11-14', '18:00').toISOString(), '2026-11-14T16:00:00.000Z')
  assert.equal(eventStartInstant('2026-07-01', '09:30').toISOString(), '2026-07-01T06:30:00.000Z')
  assert.equal(eventStartInstant('2026-03-29', '03:30').toISOString(), '2026-03-29T01:30:00.000Z')
  assert.equal(eventStartInstant('2026-10-25', '03:30').toISOString(), '2026-10-25T01:30:00.000Z')
  assert.equal(eventStartInstant('2026-11-14', '18:00', 'UTC').toISOString(), '2026-11-14T18:00:00.000Z')
  assert.throws(() => eventStartInstant('2026-02-30'), RangeError)
  assert.throws(() => eventStartInstant('2026-11-14', '6pm'), RangeError)
})

test('utcOffsetAt formats ±HH:MM', () => {
  assert.equal(utcOffsetAt(new Date('2026-11-14T16:00:00Z')), '+02:00')
  assert.equal(utcOffsetAt(new Date('2026-07-01T06:30:00Z')), '+03:00')
  assert.equal(utcOffsetAt(new Date('2026-07-01T06:30:00Z'), 'UTC'), '+00:00')
  assert.equal(utcOffsetAt(new Date('2026-07-01T06:30:00Z'), 'America/Chicago'), '-05:00')
})

test('formatEventWhen per locale', () => {
  const timed = { startDate: '2026-11-14', startTime: '18:00' }
  const summer = { startDate: '2026-07-01', startTime: '09:30' }
  const untimed = { startDate: '2026-11-14' }
  const range = { startDate: '2026-11-14', endDate: '2026-11-16' }

  assert.equal(formatEventWhen(timed, 'ro-RO'), '14 noiembrie · 18:00')
  assert.equal(formatEventWhen(summer, 'ro-RO'), '1 iulie · 9:30')
  assert.equal(formatEventWhen(untimed, 'ro-RO'), '14 noiembrie')
  assert.equal(formatEventWhen(range, 'ro-RO'), '14 noiembrie – 16 noiembrie')

  assert.equal(plain(formatEventWhen(timed, 'en-US')), 'November 14 · 6:00 PM')
  assert.equal(plain(formatEventWhen(summer, 'en-US')), 'July 1 · 9:30 AM')
  assert.equal(formatEventWhen(untimed, 'en-US'), 'November 14')
  assert.equal(formatEventWhen(range, 'en-US'), 'November 14 – November 16')

  assert.equal(formatEventWhen(timed, 'de-DE'), '14. November · 18:00')
  assert.equal(formatEventWhen(untimed, 'de-DE'), '14. November')
  assert.equal(formatEventWhen(range, 'de-DE'), '14. November – 16. November')

  assert.equal(formatEventWhen(timed, 'hu-HU'), 'november 14. · 18:00')
  assert.equal(formatEventWhen(untimed, 'hu-HU'), 'november 14.')
  assert.equal(formatEventWhen(range, 'hu-HU'), 'november 14. – november 16.')

  assert.equal(formatEventWhen({}, 'ro-RO'), null)
  // A stray time on a multi-day range is ignored.
  assert.equal(formatEventWhen({ ...range, startTime: '18:00' }, 'ro-RO'), '14 noiembrie – 16 noiembrie')
  assert.equal(formatEventWhen(timed, 'ro-RO', { separator: ', ' }), '14 noiembrie, 18:00')
})

test('formatEventWhen falls back to raw strings on malformed input', () => {
  assert.doesNotThrow(() => formatEventWhen({ startDate: 'bad', startTime: 'xx' }, 'ro-RO'))
  assert.equal(formatEventWhen({ startDate: 'bad', startTime: 'xx' }, 'ro-RO'), 'bad · xx')
  assert.equal(formatEventWhen({ startDate: '2026-11-14', endDate: 'nope' }, 'ro-RO'), '14 noiembrie – nope')
})

test('formatEventTime', () => {
  assert.equal(formatEventTime({ startDate: '2026-11-14', startTime: '18:00' }, 'ro-RO'), '18:00')
  assert.equal(plain(formatEventTime({ startDate: '2026-11-14', startTime: '18:00' }, 'en-US')), '6:00 PM')
  assert.equal(formatEventTime({ startDate: '2026-11-14' }, 'ro-RO'), null)
  assert.equal(formatEventTime({ startDate: '2026-11-14', endDate: '2026-11-16', startTime: '18:00' }, 'ro-RO'), null)
})

test('eventSortKey and compareEventSchedules (BR-013)', () => {
  assert.equal(eventSortKey({}), null)
  assert.equal(eventSortKey({ startDate: '2026-03-01' }), '2026-03-01')
  assert.equal(eventSortKey({ startDate: '2026-03-01', startTime: '09:00' }), '2026-03-01T09:00')

  const items = [
    { id: 'undated' },
    { id: 'late', startDate: '2026-03-01', startTime: '18:00' },
    { id: 'next', startDate: '2026-03-02' },
    { id: 'early', startDate: '2026-03-01', startTime: '09:00' },
    { id: 'untimed', startDate: '2026-03-01' },
    { id: 'undated2' },
  ]
  assert.deepEqual(
    [...items].sort(compareEventSchedules).map(i => i.id),
    ['untimed', 'early', 'late', 'next', 'undated', 'undated2'],
  )
  assert.equal(compareEventSchedules({ startDate: '2026-03-01' }, { startDate: '2026-03-01' }), 0)
  assert.equal(compareEventSchedules({}, {}), 0)
})
