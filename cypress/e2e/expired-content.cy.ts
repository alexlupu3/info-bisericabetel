/**
 * Expired content must never reach the public site.
 *
 * Regression: in production the API container ran in UTC while the church
 * (and its admins) live in Europe/Bucharest. For ~3 hours each evening the
 * server's CURRENT_DATE was still the previous day, so items the admin
 * already showed as expired kept rendering on the public hub.
 *
 * The API now compares against Romania-local "today", and the public client
 * runs the same isItemPast check the admin does as a safety net. These tests
 * exercise the client safety net by handing it items the API would normally
 * have filtered, and asserting they still don't render.
 */

const SITES_FIXTURE = {
  sites: [
    { slug: 'centru', name: 'Centru', accent: '#ff6200' },
  ],
}

const baseItem = {
  state: 'published' as const,
  sites: [] as string[],
  exclusiveSite: null,
  orderPosition: 0,
  groupId: null,
  groupTitle: null,
  expiresAt: null,
  createdAt: '',
  updatedAt: '',
}

// Build "YYYY-MM-DD" from the visitor's local calendar day. Using
// toISOString() would round to UTC and drift off by a day late at night in
// negative-UTC zones, which is exactly the gap this test is meant to cover.
function isoDay(offsetDays: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('Public hub — expired content is hidden', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/sites', SITES_FIXTURE).as('sites')
  })

  it('hides a card whose endDate is in the past', () => {
    cy.intercept('GET', '/api/content*', {
      site: null,
      items: [
        {
          ...baseItem, id: 'expired-card', type: 'card',
          data: {
            title: 'Eveniment expirat',
            startDate: isoDay(-7),
            endDate: isoDay(-1),
          },
        },
        {
          ...baseItem, id: 'live-card', type: 'card',
          data: {
            title: 'Eveniment activ',
            startDate: isoDay(0),
            endDate: isoDay(7),
          },
        },
      ],
    }).as('content')

    cy.visit('/')
    cy.wait('@content')

    cy.contains('Eveniment activ').should('be.visible')
    cy.contains('Eveniment expirat').should('not.exist')
  })

  it('hides a richtext whose startDate is in the past and has no endDate', () => {
    cy.intercept('GET', '/api/content*', {
      site: null,
      items: [
        {
          ...baseItem, id: 'expired-richtext', type: 'richtext',
          data: { body: 'Anunț învechit', startDate: isoDay(-3) },
        },
      ],
    }).as('content')

    cy.visit('/')
    cy.wait('@content')

    cy.contains('Anunț învechit').should('not.exist')
    cy.get('[data-testid="content-empty"]').should('be.visible')
  })

  it('hides an item whose expiresAt has passed even when it has no JSONB dates', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    cy.intercept('GET', '/api/content*', {
      site: null,
      items: [
        {
          ...baseItem, id: 'expired-by-column', type: 'richtext',
          expiresAt: yesterday.toISOString(),
          data: { body: 'Mesaj expirat de coloană' },
        },
      ],
    }).as('content')

    cy.visit('/')
    cy.wait('@content')

    cy.contains('Mesaj expirat de coloană').should('not.exist')
    cy.get('[data-testid="content-empty"]').should('be.visible')
  })

  it('keeps an item whose endDate is today', () => {
    cy.intercept('GET', '/api/content*', {
      site: null,
      items: [
        {
          ...baseItem, id: 'today-card', type: 'card',
          data: { title: 'Eveniment azi', startDate: isoDay(0), endDate: isoDay(0) },
        },
      ],
    }).as('content')

    cy.visit('/')
    cy.wait('@content')

    cy.contains('Eveniment azi').should('be.visible')
  })
})

export {}
