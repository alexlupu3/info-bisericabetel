import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectUpcomingEvents } from './upcoming-events.js'

// selectUpcomingEvents is re-exported by public-content.ts (spec 02 §6.3); tested here
// because public-content.ts needs a database connection at import time.

const it = (id: string, data: Record<string, unknown>) => ({ id, data })
const ids = (items: Array<{ id: string }>) => items.map(i => i.id)

test('keeps only items with a non-empty startDate', () => {
  const out = selectUpcomingEvents([
    it('a', { startDate: '2026-11-14' }),
    it('b', {}),
    it('c', { startDate: '  ' }),
    it('d', { endDate: '2026-11-20' }),
    it('e', { date: '2026-11-14' }),
  ])
  assert.deepEqual(ids(out), ['a'])
})

test('chronological: date, then untimed before timed, then time; ties keep display order', () => {
  const out = selectUpcomingEvents([
    it('late', { startDate: '2026-12-01' }),
    it('t18', { startDate: '2026-11-14', startTime: '18:00' }),
    it('untimed1', { startDate: '2026-11-14' }),
    it('t09', { startDate: '2026-11-14', startTime: '09:00' }),
    it('untimed2', { startDate: '2026-11-14' }),
    it('inProgress', { startDate: '2026-10-01', endDate: '2026-12-31' }),
  ])
  assert.deepEqual(ids(out), ['inProgress', 'untimed1', 'untimed2', 't09', 't18', 'late'])
})

test('caps the result (default 100)', () => {
  const many = Array.from({ length: 130 }, (_, i) => it(String(i), { startDate: '2026-11-14' }))
  assert.equal(selectUpcomingEvents(many).length, 100)
  assert.equal(selectUpcomingEvents(many, 5).length, 5)
  assert.deepEqual(ids(selectUpcomingEvents(many, 3)), ['0', '1', '2'])
})
