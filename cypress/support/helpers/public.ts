/**
 * Shared fixtures and stubs for public-hub specs (spec 03: SEO, item pages, initial data).
 */
export const SITES_FIXTURE = {
  sites: [
    { slug: 'centru', name: 'Centru', accent: '#ff6200', address: 'Str. Centrală 1, Cluj-Napoca' },
    { slug: 'vest',   name: 'Vest',   accent: '#a0384b', address: null },
  ],
}

export const baseItem = {
  state: 'published' as const,
  sites: [] as string[],
  exclusiveSite: null as string | null,
  orderPosition: 0,
  groupId: null as string | null,
  groupTitle: null as string | null,
  expiresAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

export const LANGUAGES_FIXTURE = {
  languages: [
    { code: 'ro', name: 'Română', isDefault: true, enabled: true },
    { code: 'en', name: 'English', isDefault: false, enabled: true },
  ],
}

/** Stubs sites, languages and translations; content is left to each spec. */
export function stubPublicBasics() {
  cy.intercept('GET', '/api/sites', SITES_FIXTURE).as('sites')
  cy.intercept('GET', '/api/languages', LANGUAGES_FIXTURE).as('languages')
  cy.intercept('GET', '/api/translations*', { locale: 'ro', translations: {} }).as('translations')
  cy.intercept('POST', '/api/events', { statusCode: 204 }).as('events')
}

/** Build "YYYY-MM-DD" for a day relative to today (visitor's local calendar). */
export function isoDay(offsetDays: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
