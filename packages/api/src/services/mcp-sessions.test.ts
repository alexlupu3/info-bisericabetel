import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SessionRegistry } from './mcp-sessions.js'

class FakeSession {
  closed = 0
  async close() { this.closed++ }
}

function setup(limits = { idleTtlMs: 1_000, maxAgeMs: 10_000, maxSessions: 3 }) {
  let t = 0
  const reg = new SessionRegistry<FakeSession>(limits, () => t)
  return { reg, advance: (ms: number) => { t += ms } }
}

test('an idle session expires and is closed; a used one stays', () => {
  const { reg, advance } = setup()
  const a = new FakeSession(), b = new FakeSession()
  reg.add('a', a)
  reg.add('b', b)
  advance(800)
  assert.equal(reg.get('b'), b)
  advance(800)
  assert.equal(reg.sweep(), 1)
  assert.equal(a.closed, 1)
  assert.equal(reg.get('a'), undefined)
  assert.equal(reg.get('b'), b)
  assert.equal(b.closed, 0)
})

test('an expired session is refused on access even before a sweep', () => {
  const { reg, advance } = setup()
  const a = new FakeSession()
  reg.add('a', a)
  advance(1_001)
  assert.equal(reg.get('a'), undefined)
  assert.equal(a.closed, 1)
  assert.equal(reg.size, 0)
})

test('a session older than maxAgeMs expires even when active', () => {
  const { reg, advance } = setup()
  const a = new FakeSession()
  reg.add('a', a)
  for (let i = 0; i < 11; i++) { advance(900); assert.equal(reg.get('a'), a) }
  advance(900) // 10 800 ms after creation, last use 900 ms ago
  assert.equal(reg.get('a'), undefined)
  assert.equal(a.closed, 1)
})

test('the registry never exceeds maxSessions: the least recently used session is evicted', () => {
  const { reg, advance } = setup()
  const s = ['a', 'b', 'c', 'd'].map(() => new FakeSession())
  reg.add('a', s[0]); advance(1)
  reg.add('b', s[1]); advance(1)
  reg.add('c', s[2]); advance(1)
  reg.get('a') // b is now the least recently used
  reg.add('d', s[3])
  assert.equal(reg.size, 3)
  assert.equal(s[1].closed, 1)
  assert.equal(reg.get('b'), undefined)
  assert.equal(reg.get('a'), s[0])
})

test('delete forgets without closing; closeAll closes everything', () => {
  const { reg } = setup()
  const a = new FakeSession(), b = new FakeSession()
  reg.add('a', a)
  reg.add('b', b)
  reg.delete('a')
  assert.equal(a.closed, 0)
  reg.closeAll()
  assert.equal(b.closed, 1)
  assert.equal(reg.size, 0)
})
