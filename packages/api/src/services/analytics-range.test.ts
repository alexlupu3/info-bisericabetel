import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketLabels, changePct, parseBoolean, parseLimit, resolveRange } from './analytics-range.js'
import { InvalidRangeError, ValidationError } from './errors.js'

// 2026-10-28 12:00 UTC = 14:00 in Bucharest (EET, after the 2026-10-25 change).
const NOW = new Date('2026-10-28T12:00:00Z')

test('resolveRange defaults to the last 30 days in Europe/Bucharest', () => {
  const r = resolveRange({}, NOW)
  assert.deepEqual(
    { from: r.from, to: r.to, days: r.days, timeZone: r.timeZone, granularity: r.granularity, compare: r.compare },
    { from: '2026-09-29', to: '2026-10-28', days: 30, timeZone: 'Europe/Bucharest', granularity: 'day', compare: true },
  )
  assert.equal(r.prevTo, '2026-09-28')
  assert.equal(r.prevFrom, '2026-08-30')
})

test('resolveRange uses "today" in the requested zone', () => {
  // 22:30 UTC on 2026-10-28 is already 2026-10-29 in Bucharest.
  const late = new Date('2026-10-28T22:30:00Z')
  assert.equal(resolveRange({}, late).to, '2026-10-29')
  assert.equal(resolveRange({ tz: 'UTC' }, late).to, '2026-10-28')
  assert.throws(() => resolveRange({ to: '2026-10-29', tz: 'UTC' }, late), /to cannot be in the future \(today in UTC is 2026-10-28\)/)
})

test('resolveRange computes an equal-length previous period', () => {
  const r = resolveRange({ from: '2026-10-01', to: '2026-10-28' }, NOW)
  assert.equal(r.days, 28)
  assert.equal(r.prevTo, '2026-09-30')
  assert.equal(r.prevFrom, '2026-09-03')
})

test('resolveRange picks week buckets for ranges over 92 days', () => {
  assert.equal(resolveRange({ from: '2026-07-29', to: '2026-10-28' }, NOW).granularity, 'day') // 92 days
  assert.equal(resolveRange({ from: '2026-07-28', to: '2026-10-28' }, NOW).granularity, 'week') // 93 days
  assert.equal(resolveRange({ granularity: 'month' }, NOW).granularity, 'month')
  assert.throws(() => resolveRange({ granularity: 'year' }, NOW), ValidationError)
})

test('resolveRange rejects invalid input with the spec 05 messages', () => {
  const cases: [Parameters<typeof resolveRange>[0], RegExp][] = [
    [{ tz: '+02:00' }, /^Invalid tz\. Use an IANA timezone name, e\.g\. Europe\/Bucharest\.$/],
    [{ tz: 'Mars/Olympus' }, /^Invalid tz\./],
    [{ from: '2026-02-30', to: '2026-03-01' }, /^from\/to must be a valid calendar date in YYYY-MM-DD format$/],
    [{ from: '2026-10-10', to: '2026-10-01' }, /^from must be on or before to$/],
    [{ to: '2026-10-29' }, /^to cannot be in the future \(today in Europe\/Bucharest is 2026-10-28\)$/],
    [{ from: '2025-10-26', to: '2026-10-27' }, /^date range cannot exceed 366 days$/],
  ]
  for (const [input, message] of cases) {
    assert.throws(() => resolveRange(input, NOW), (e: unknown) => e instanceof InvalidRangeError && message.test((e as Error).message))
  }
  assert.equal(resolveRange({ from: '2025-10-27', to: '2026-10-27' }, NOW).days, 366)
})

test('bucketLabels clamps the first bucket to from and starts weeks on Monday', () => {
  assert.deepEqual(bucketLabels('2026-10-25', '2026-10-27', 'day'), ['2026-10-25', '2026-10-26', '2026-10-27'])
  // 2026-10-01 is a Thursday; Mondays: 05, 12, 19, 26.
  assert.deepEqual(bucketLabels('2026-10-01', '2026-10-28', 'week'), ['2026-10-01', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
  assert.deepEqual(bucketLabels('2026-08-15', '2026-10-28', 'month'), ['2026-08-15', '2026-09-01', '2026-10-01'])
  assert.equal(bucketLabels('2025-10-27', '2026-10-27', 'day').length, 366)
})

test('changePct is null on a zero baseline, per metric', () => {
  assert.equal(changePct(3, 0), null)
  assert.equal(changePct(0, 0), null)
  assert.equal(changePct(87, 50), 74)
  assert.equal(changePct(25, 50), -50)
})

test('parseLimit and parseBoolean accept REST strings and MCP values', () => {
  assert.equal(parseLimit(undefined, 10, 50), 10)
  assert.equal(parseLimit('2', 10, 50), 2)
  assert.equal(parseLimit(50, 10, 50), 50)
  assert.throws(() => parseLimit('51', 10, 50), /limit must be an integer between 1 and 50/)
  assert.throws(() => parseLimit('1.5', 10, 50), ValidationError)
  assert.equal(parseBoolean('false', 'compare'), false)
  assert.equal(parseBoolean(true, 'compare'), true)
  assert.equal(parseBoolean(undefined, 'compare'), undefined)
  assert.throws(() => parseBoolean('nope', 'compare'), /compare must be true or false/)
})
