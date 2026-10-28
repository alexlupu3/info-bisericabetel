/**
 * Event start time (FR-075 – FR-079, BR-035):
 * - admin form: the "Ora de început" input exists only for single-day events and
 *   the payload always carries data.startTime ("HH:mm" or null)
 * - public card: "{date} · {time}" localised with Intl, wrapped in <time dateTime>
 * - expiry stays date-based: a timed event is visible after its hour has passed
 */
import { stubI18nRoutes } from '../support/helpers/i18n'

const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'

const adminItem = {
  type: 'card', state: 'draft', sites: [] as string[], exclusiveSite: null, orderPosition: 0,
  groupId: null, expiresAt: null, createdAt: '', updatedAt: '',
}

function adminSetup(items: object[] = []) {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] }).as('sites')
  cy.intercept('GET', '/api/admin/languages', {
    languages: [
      { code: 'ro', name: 'Română', isDefault: true, enabled: true },
      { code: 'en', name: 'English', isDefault: false, enabled: true },
    ],
  })
  cy.intercept('GET', '/api/admin/content/*/translations', { translations: [] })
  cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) } })
  cy.wait('@me')
}

function stubCreate() {
  cy.intercept('POST', '/api/admin/content', {
    statusCode: 201,
    body: { ...adminItem, id: 'new', data: { title: 'Seară de rugăciune' } },
  }).as('create')
}

function openCreateCard() {
  cy.get('[data-testid="create-content-btn"]').click()
  cy.get('[data-testid="create-type-select"]').select('card')
  cy.get('[data-testid="create-title-input"]').type('Seară de rugăciune')
}

function openEdit(id: string) {
  cy.get(`[data-testid="item-menu-trigger-${id}"]`).click()
  cy.get(`[data-testid="item-menu-edit-${id}"]`).click()
  cy.get('[data-testid="edit-form"]').should('be.visible')
}

describe('Admin — event start time', () => {
  it('shows the time input only for single-day events', () => {
    adminSetup()
    openCreateCard()

    cy.get('[data-testid="create-start-time-input"]').should('not.exist')
    cy.get('[data-testid="create-date-input"]').type('2026-11-14')
    cy.get('[data-testid="create-start-time-input"]').should('be.visible')

    cy.get('[data-testid="create-end-date-input"]').type('2026-11-14')
    cy.get('[data-testid="create-start-time-input"]').should('be.visible')
    cy.get('[data-testid="start-time-multiday-hint"]').should('not.exist')

    cy.get('[data-testid="create-start-time-input"]').type('18:00')
    cy.get('[data-testid="create-end-date-input"]').clear().type('2026-11-16')
    cy.get('[data-testid="create-start-time-input"]').should('not.exist')
    cy.get('[data-testid="start-time-multiday-hint"]').should('be.visible')

    cy.get('[data-testid="create-end-date-input"]').clear()
    cy.get('[data-testid="create-start-time-input"]').should('be.visible').and('have.value', '')
    cy.get('[data-testid="start-time-multiday-hint"]').should('not.exist')
  })

  it('sends startTime on create', () => {
    adminSetup()
    stubCreate()
    openCreateCard()
    cy.get('[data-testid="create-date-input"]').type('2026-11-14')
    cy.get('[data-testid="create-start-time-input"]').type('18:00')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body.data').should(data => {
      expect(data.startDate).to.eq('2026-11-14')
      expect(data.startTime).to.eq('18:00')
    })
  })

  it('clears the time when the event becomes multi-day', () => {
    adminSetup()
    stubCreate()
    openCreateCard()
    cy.get('[data-testid="create-date-input"]').type('2026-11-14')
    cy.get('[data-testid="create-start-time-input"]').type('18:00')
    cy.get('[data-testid="create-end-date-input"]').type('2026-11-16')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body.data').should(data => {
      expect(data.endDate).to.eq('2026-11-16')
      expect(data.startTime).to.eq(null)
    })
  })

  it('clears end date and time together with the date', () => {
    adminSetup()
    stubCreate()
    openCreateCard()
    cy.get('[data-testid="create-date-input"]').type('2026-11-14')
    cy.get('[data-testid="create-start-time-input"]').type('18:00')
    cy.get('[data-testid="create-date-input"]').clear()
    cy.get('[data-testid="create-start-time-input"]').should('not.exist')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body.data').should(data => {
      expect(data.startDate).to.eq(null)
      expect(data.endDate).to.eq(null)
      expect(data.startTime).to.eq(null)
    })
  })

  describe('edit', () => {
    const timed = { ...adminItem, id: 'timed', data: { title: 'Concert', startDate: '2026-11-14', startTime: '18:00' } }
    const multiDay = {
      ...adminItem, id: 'multi', orderPosition: 1,
      data: { title: 'Conferință', startDate: '2026-11-14', endDate: '2026-11-16', startTime: '18:00' },
    }

    beforeEach(() => adminSetup([timed, multiDay]))

    it('pre-fills the time and keeps it on save (regression: partial PATCH)', () => {
      cy.intercept('PATCH', '/api/admin/content/timed', timed).as('patch')
      openEdit('timed')
      cy.get('[data-testid="create-start-time-input"]').should('have.value', '18:00')
      cy.get('[data-testid="create-submit-btn"]').click()
      cy.wait('@patch').its('request.body.data.startTime').should('eq', '18:00')
    })

    it('shows the hint for a multi-day item and sends startTime: null', () => {
      cy.intercept('PATCH', '/api/admin/content/multi', multiDay).as('patch')
      openEdit('multi')
      cy.get('[data-testid="create-start-time-input"]').should('not.exist')
      cy.get('[data-testid="start-time-multiday-hint"]').should('be.visible')
      cy.get('[data-testid="create-submit-btn"]').click()
      cy.wait('@patch').its('request.body.data').should(data => {
        expect(data).to.have.property('startTime', null)
      })
    })

    it('hides the dates row, including the time, in translation mode', () => {
      openEdit('timed')
      cy.get('[data-testid="create-start-time-input"]').should('be.visible')
      cy.get('[data-testid="translation-locale-select"]').select('en')
      cy.get('[data-testid="create-date-input"]').should('not.exist')
      cy.get('[data-testid="create-start-time-input"]').should('not.exist')
    })
  })
})

const publicItem = {
  state: 'published' as const, sites: [] as string[], orderPosition: 0, groupId: null,
  groupTitle: null, expiresAt: null, createdAt: '', updatedAt: '', type: 'card',
}

function visitPublic(items: object[], lang?: string) {
  cy.intercept('GET', '/api/sites', { sites: [] })
  stubI18nRoutes()
  cy.intercept('GET', '/api/content*', { site: null, items }).as('content')
  cy.visit('/', {
    onBeforeLoad(win) {
      if (lang) win.localStorage.setItem('betel-lang', lang)
      else win.localStorage.removeItem('betel-lang')
    },
  })
  cy.wait('@content')
}

describe('Public card — event start time', () => {
  const timed = { ...publicItem, id: 'p-timed', data: { title: 'Concert de seară', startDate: '2099-11-14', startTime: '18:00' } }

  it('renders the Romanian date and time with an ISO dateTime', () => {
    visitPublic([timed])
    cy.contains('Concert de seară').parents('article').within(() => {
      cy.get('time[datetime="2099-11-14T18:00:00+02:00"]')
        .should('contain', '14 noiembrie')
        .and('contain', '18:00')
        .and('contain', '·')
    })
  })

  it('renders the time in the visitor language', () => {
    visitPublic([timed], 'en')
    cy.contains('Concert de seară').parents('article').find('time')
      .invoke('text')
      .should('match', /November 14 · 6:00\sPM/)
  })

  it('renders date only when there is no time', () => {
    visitPublic([{ ...publicItem, id: 'p-day', data: { title: 'Zi de post', startDate: '2099-11-14' } }])
    cy.contains('Zi de post').parents('article').within(() => {
      cy.get('time[datetime="2099-11-14"]').invoke('text').should('eq', '14 noiembrie')
    })
  })

  it('ignores a stray time on a multi-day event', () => {
    visitPublic([{
      ...publicItem, id: 'p-multi',
      data: { title: 'Conferință', startDate: '2099-11-14', endDate: '2099-11-16', startTime: '18:00' },
    }])
    cy.contains('Conferință').parents('article').within(() => {
      cy.contains('14 noiembrie – 16 noiembrie').should('exist')
      cy.contains('18:00').should('not.exist')
      cy.get('time').should('not.exist')
    })
  })

  it('keeps a timed event visible after its hour has passed (regression: expiry stays date-based)', () => {
    // 20:00 on 2026-11-14 in Bucharest (UTC+2)
    cy.clock(Date.UTC(2026, 10, 14, 18, 0), ['Date'])
    visitPublic([{ ...publicItem, id: 'p-today', data: { title: 'Seara de azi', startDate: '2026-11-14', startTime: '18:00' } }])
    cy.contains('Seara de azi').should('be.visible')
  })
})
