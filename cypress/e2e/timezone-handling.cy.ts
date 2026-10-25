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

describe('Admin — statistics use the viewer timezone', () => {
  const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
  const series = (from: number) => Array.from({ length: 3 }, (_, i) => ({
    label: `2026-10-${String(from + i).padStart(2, '0')}`, views: 1, clicks: 1,
  }))

  beforeEach(() => {
    cy.intercept('GET', '/api/auth/me', mockUser)
    cy.intercept('GET', '/api/sites', { sites: [] })
    cy.intercept('GET', '/api/admin/content', { items: [] })
    cy.intercept('GET', '/api/admin/groups', { groups: [] })
    cy.intercept('GET', '/api/admin/analytics/overview*', {
      period: 'week',
      current: { views: 3, clicks: 3, series: series(1) },
      previous: { views: 3, clicks: 3, series: series(28) },
      viewsChange: 0, clicksChange: 0,
    }).as('overview')
    cy.intercept({ method: 'GET', pathname: '/api/admin/analytics/items' }, { items: [] })
    cy.intercept('GET', '/api/admin/analytics/sites-comparison*', { period: 'week', sites: [], series: [] }).as('sitesComparison')
  })

  function visitAnalytics(now?: number) {
    if (now) cy.clock(now, ['Date'])
    cy.visit('/admin/analytics', { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', 'mock-jwt-token') } })
  }

  it('sends the browser timezone with every bucketed request', () => {
    visitAnalytics()
    cy.window().then(win => {
      const tz = encodeURIComponent(win.Intl.DateTimeFormat().resolvedOptions().timeZone)
      cy.wait('@overview').its('request.url').should('include', `tz=${tz}`)
      cy.wait('@sitesComparison').its('request.url').should('include', `tz=${tz}`)
    })
  })

  it('renders day buckets exactly as returned, without shifting them', () => {
    visitAnalytics()
    cy.wait('@overview')
    cy.get('[data-testid="trend-chart"]').should('contain', '01 oct.').and('contain', '03 oct.')
  })

  it('limits the start-date picker to today in the viewer timezone', () => {
    // 00:30 on 2026-10-26 in Bucharest, still 2026-10-25 in UTC
    const now = Date.UTC(2026, 9, 25, 22, 30)
    visitAnalytics(now)
    cy.window().then(win => {
      const parts = new win.Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date(now))
      const get = (t: string) => parts.find(p => p.type === t)!.value
      cy.get('[data-testid="start-date-input"]').should('have.attr', 'max', `${get('year')}-${get('month')}-${get('day')}`)
    })
  })
})

export {}
