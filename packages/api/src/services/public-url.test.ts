import { test } from 'node:test'
import assert from 'node:assert/strict'
import { absoluteUrl, parsePublicBaseUrl, resolvePublicBaseUrl } from './public-url.js'

test('parsePublicBaseUrl strips trailing slashes and keeps the origin', () => {
  assert.equal(parsePublicBaseUrl('https://x/'), 'https://x')
  assert.equal(parsePublicBaseUrl('https://info.bisericabetel.com//'), 'https://info.bisericabetel.com')
  assert.equal(parsePublicBaseUrl('http://localhost:3100'), 'http://localhost:3100')
})

test('parsePublicBaseUrl rejects malformed values', () => {
  assert.throws(() => parsePublicBaseUrl('info.bisericabetel.com'))
  assert.throws(() => parsePublicBaseUrl('ftp://host'))
  assert.throws(() => parsePublicBaseUrl('https://host/path'))
  assert.throws(() => parsePublicBaseUrl('https://host?x=1'))
})

test('resolvePublicBaseUrl: required in production, dev default with a warning', () => {
  assert.throws(() => resolvePublicBaseUrl({ NODE_ENV: 'production' }), /PUBLIC_BASE_URL/)
  assert.throws(() => resolvePublicBaseUrl({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'nope' }))
  const warnings: string[] = []
  assert.equal(resolvePublicBaseUrl({}, m => warnings.push(m)), 'http://localhost:3100')
  assert.equal(warnings.length, 1)
  assert.equal(resolvePublicBaseUrl({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://x/' }), 'https://x')
})

test('absoluteUrl resolves root-relative paths and passes http(s) URLs through', () => {
  assert.equal(absoluteUrl('/i/1', 'https://x'), 'https://x/i/1')
  assert.equal(absoluteUrl('https://cdn.example/a.png', 'https://x'), 'https://cdn.example/a.png')
  assert.throws(() => absoluteUrl('//evil.example/a', 'https://x'))
  assert.throws(() => absoluteUrl('javascript:alert(1)', 'https://x'))
  assert.throws(() => absoluteUrl('relative/path', 'https://x'))
})
