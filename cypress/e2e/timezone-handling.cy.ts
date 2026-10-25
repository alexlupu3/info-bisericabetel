/**
 * Timezone rules:
 * - Event dates (data.startDate / data.endDate) are calendar days in Romania.
 *   An event stays visible until the end of its last day in Europe/Bucharest,
 *   wherever the visitor or editor is. Regression: the public safety-net
 *   filter and the admin "expirat" badge used the browser's own calendar day,
 *   so visitors east of Romania lost events before midnight in Bucharest.
 * - Statistics are stored in UTC and shown in the viewer's timezone: the admin
 *   sends its IANA timezone as `tz` and date buckets are rendered as-is.
 *
 * The clock is frozen around Bucharest midnight (EET, UTC+2 after the
 * 2026-10-25 DST change), so these assertions hold in any browser timezone.
 */

// 23:59 on 2026-10-25 in Bucharest
const BEFORE_BUCHAREST_MIDNIGHT = Date.UTC(2026, 9, 25, 21, 59)
// 00:00:30 on 2026-10-26 in Bucharest
const AFTER_BUCHAREST_MIDNIGHT = Date.UTC(2026, 9, 25, 22, 0, 30)

const baseItem = {
  state: 'published' as const,
  sites: [] as string[],
  exclusiveSite: null,
  orderPosition: 0,
  groupId: null,
  groupTitle: null,
  expiresAt: null as string | null,
  createdAt: '',
  updatedAt: '',
}

const eventItems = [
  { ...baseItem, id: 'ends-today', type: 'card', data: { title: 'Se termină azi', startDate: '2026-10-20', endDate: '2026-10-25' } },
  { ...baseItem, id: 'single-day', type: 'richtext', data: { body: 'Doar azi', startDate: '2026-10-25' } },
  { ...baseItem, id: 'column-expiry', type: 'richtext', expiresAt: '2026-10-25T22:00:00.000Z', data: { body: 'Expiră la miezul nopții' } },
  { ...baseItem, id: 'ends-tomorrow', type: 'card', data: { title: 'Se termină mâine', startDate: '2026-10-26', endDate: '2026-10-26' } },
]

describe('Public hub — events expire at the end of the day in Bucharest', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/sites', { sites: [{ slug: 'centru', name: 'Centru', accent: '#ff6200' }] })
    cy.intercept('GET', '/api/content*', { site: null, items: eventItems }).as('content')
  })

  it('keeps events ending today visible until 23:59 Bucharest time', () => {
    cy.clock(BEFORE_BUCHAREST_MIDNIGHT, ['Date'])
    cy.visit('/')
    cy.wait('@content')

    cy.contains('Se termină azi').should('be.visible')
    cy.contains('Doar azi').should('be.visible')
    cy.contains('Expiră la miezul nopții').should('be.visible')
    cy.contains('Se termină mâine').should('be.visible')
  })

  it('hides them once the day is over in Bucharest', () => {
    cy.clock(AFTER_BUCHAREST_MIDNIGHT, ['Date'])
    cy.visit('/')
    cy.wait('@content')

    cy.contains('Se termină mâine').should('be.visible')
    cy.contains('Se termină azi').should('not.exist')
    cy.contains('Doar azi').should('not.exist')
    cy.contains('Expiră la miezul nopții').should('not.exist')
  })

  it('shows the event date as entered, without shifting it by the visitor timezone', () => {
    cy.clock(BEFORE_BUCHAREST_MIDNIGHT, ['Date'])
    cy.visit('/')
    cy.wait('@content')

    cy.contains('Se termină mâine').parents('article').should('contain', '26 octombrie')
  })
})

describe('Admin — expired badge and expiresAt follow Bucharest time', () => {
  const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }

  function visitAdmin(now: number) {
    cy.clock(now, ['Date'])
    cy.intercept('GET', '/api/auth/me', mockUser).as('me')
    cy.intercept('GET', '/api/admin/groups', { groups: [] })
    cy.intercept('GET', '/api/sites', { sites: [] })
    cy.intercept('GET', '/api/admin/content', { items: eventItems }).as('content')
    cy.visit('/admin/', { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', 'mock-jwt-token') } })
    cy.wait('@me')
  }

  it('does not mark an event ending today as expired before Bucharest midnight', () => {
    visitAdmin(BEFORE_BUCHAREST_MIDNIGHT)
    cy.get('[data-testid="past-badge-ends-today"]').should('not.exist')
    cy.get('[data-testid="past-badge-single-day"]').should('not.exist')
    cy.get('[data-testid="past-badge-column-expiry"]').should('not.exist')
  })

  it('marks it as expired after Bucharest midnight', () => {
    visitAdmin(AFTER_BUCHAREST_MIDNIGHT)
    cy.get('[data-testid="past-badge-ends-today"]').should('be.visible')
    cy.get('[data-testid="past-badge-single-day"]').should('be.visible')
    cy.get('[data-testid="past-badge-column-expiry"]').should('be.visible')
    cy.get('[data-testid="past-badge-ends-tomorrow"]').should('not.exist')
  })

  it('saving an item keeps its exact expiresAt instead of truncating it to UTC midnight', () => {
    visitAdmin(BEFORE_BUCHAREST_MIDNIGHT)
    cy.intercept('PATCH', '/api/admin/content/column-expiry', { ...eventItems[2] }).as('patch')

    cy.get('[data-testid="item-menu-trigger-column-expiry"]').click()
    cy.get('[data-testid="item-menu-edit-column-expiry"]').click()
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@patch').its('request.body.expiresAt').should('eq', '2026-10-25T22:00:00.000Z')
  })
})

export {}
