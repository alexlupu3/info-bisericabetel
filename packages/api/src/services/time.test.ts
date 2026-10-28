import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calendarDayIn, hourSlotsIn, invalidEventDate, isCalendarDay, parseExpiresAt, startOfDayIn,
} from './time.js'

const BUCHAREST = 'Europe/Bucharest'

test('calendarDayIn switches day at midnight in the given timezone', () => {
  assert.equal(calendarDayIn(BUCHAREST, new Date('2026-10-25T21:59:59Z')), '2026-10-25')
  assert.equal(calendarDayIn(BUCHAREST, new Date('2026-10-25T22:00:00Z')), '2026-10-26')
  assert.equal(calendarDayIn('UTC', new Date('2026-10-25T22:00:00Z')), '2026-10-25')
})

test('startOfDayIn handles both DST transitions', () => {
  assert.equal(startOfDayIn('2026-10-25', BUCHAREST).toISOString(), '2026-10-24T21:00:00.000Z')
  assert.equal(startOfDayIn('2026-10-26', BUCHAREST).toISOString(), '2026-10-25T22:00:00.000Z')
  assert.equal(startOfDayIn('2026-03-29', BUCHAREST).toISOString(), '2026-03-28T22:00:00.000Z')
  assert.equal(startOfDayIn('2026-03-30', BUCHAREST).toISOString(), '2026-03-29T21:00:00.000Z')
})

test('isCalendarDay accepts only real YYYY-MM-DD dates', () => {
  assert.ok(isCalendarDay('2026-10-25'))
  assert.ok(!isCalendarDay('2026-02-30'))
  assert.ok(!isCalendarDay('25/10/2026'))
  assert.ok(!isCalendarDay('2026-10-25T10:00:00Z'))
})

test('invalidEventDate rejects malformed startDate/endDate and allows null', () => {
  assert.equal(invalidEventDate({ startDate: '2026-10-25', endDate: null }), null)
  assert.match(invalidEventDate({ endDate: '2026-13-01' }) ?? '', /endDate/)
})

test('parseExpiresAt treats a bare date as the end of that day in Romania', () => {
  assert.equal(parseExpiresAt('2026-10-25')?.toISOString(), '2026-10-25T22:00:00.000Z')
  assert.equal(parseExpiresAt('2026-07-01')?.toISOString(), '2026-07-01T21:00:00.000Z')
})

test('parseExpiresAt accepts timestamps with Z or an explicit offset', () => {
  assert.equal(parseExpiresAt('2026-10-25T23:00:00Z')?.toISOString(), '2026-10-25T23:00:00.000Z')
  assert.equal(parseExpiresAt('2026-10-25T23:00:00+03:00')?.toISOString(), '2026-10-25T20:00:00.000Z')
  assert.equal(parseExpiresAt('2026-10-25T23:00:00.123Z')?.toISOString(), '2026-10-25T23:00:00.123Z')
})

test('parseExpiresAt rejects server-timezone-dependent and impossible values', () => {
  assert.equal(parseExpiresAt('2026-10-25T23:00:00'), undefined)
  assert.equal(parseExpiresAt('2026-02-30'), undefined)
  assert.equal(parseExpiresAt('2026-02-30T10:00:00Z'), undefined)
  assert.equal(parseExpiresAt('next sunday'), undefined)
})

test('hourSlotsIn has 24 slots on a normal day', () => {
  const slots = hourSlotsIn('2026-10-20', BUCHAREST)
  assert.equal(slots.length, 24)
  assert.equal(slots[0].label, '00')
  assert.equal(slots[23].label, '23')
})

test('hourSlotsIn keeps the repeated hour when clocks go back', () => {
  const slots = hourSlotsIn('2026-10-25', BUCHAREST)
  assert.equal(slots.length, 25)
  assert.deepEqual(slots.filter(s => s.label === '03').map(s => new Date(s.start * 1000).toISOString()),
    ['2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z'])
})

test('hourSlotsIn skips the missing hour when clocks go forward', () => {
  const slots = hourSlotsIn('2026-03-29', BUCHAREST)
  assert.equal(slots.length, 23)
  assert.ok(!slots.some(s => s.label === '03'))
})

test('hourSlotsIn follows half-hour offsets', () => {
  const slots = hourSlotsIn('2026-10-25', 'Asia/Kolkata')
  assert.equal(slots.length, 24)
  assert.equal(new Date(slots[0].start * 1000).toISOString(), '2026-10-24T18:30:00.000Z')
})
