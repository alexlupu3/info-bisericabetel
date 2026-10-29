/**
 * Event location (FR-090 – FR-094, BR-050 – BR-053):
 * - admin form: "Loc de desfășurare" input for cards only, directly below the dates row,
 *   maxLength 70 with a live counter and a soft hint above 50; the payload always carries
 *   data.location (normalised text or null); translatable with the same limit
 * - public card: own row under the date/time row with a map pin and a screen-reader label,
 *   shown without a date too, never a link
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
    body: { ...adminItem, id: 'new', data: { title: 'Seară de tineret' } },
  }).as('create')
}

function openCreateCard() {
  cy.get('[data-testid="create-content-btn"]').click()
  cy.get('[data-testid="create-type-select"]').select('card')
  cy.get('[data-testid="create-title-input"]').type('Seară de tineret')
}

function openEdit(id: string) {
  cy.get(`[data-testid="item-menu-trigger-${id}"]`).click()
  cy.get(`[data-testid="item-menu-edit-${id}"]`).click()
  cy.get('[data-testid="edit-form"]').should('be.visible')
}

describe('Admin — event location', () => {
  it('sends the location on create and counts its length', () => {
    adminSetup()
    stubCreate()
    openCreateCard()
    cy.get('[data-testid="create-date-input"]').type('2026-11-14')
    cy.get('[data-testid="create-location-input"]').type('Sala mare, etaj 1')
    cy.get('[data-testid="create-location-counter"]').should('have.text', '17 / 70')
    cy.get('[data-testid="create-location-soft-hint"]').should('not.exist')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body.data.location').should('eq', 'Sala mare, etaj 1')
  })

  it('renders the input right after the dates row, for cards only', () => {
    adminSetup()
    openCreateCard()
    cy.get('[data-testid="create-date-input"]').parents('div.flex').first().next()
      .find('[data-testid="create-location-input"]').should('exist')
    for (const type of ['poster', 'richtext', 'video']) {
      cy.get('[data-testid="create-type-select"]').select(type)
      cy.get('[data-testid="create-location-input"]').should('not.exist')
    }
  })

  it('stops at 70 characters', () => {
    adminSetup()
    stubCreate()
    openCreateCard()
    cy.get('[data-testid="create-location-input"]').type('x'.repeat(80), { delay: 0 })
    cy.get('[data-testid="create-location-input"]').invoke('val').should('have.length', 70)
    cy.get('[data-testid="create-location-counter"]').should('have.text', '70 / 70')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body.data.location').should('eq', 'x'.repeat(70))
  })

  it('shows the soft hint above 50 characters', () => {
    adminSetup()
    openCreateCard()
    cy.get('[data-testid="create-location-input"]').type('x'.repeat(51), { delay: 0 })
    cy.get('[data-testid="create-location-soft-hint"]').should('be.visible')
    cy.get('[data-testid="create-location-counter"]').should('have.class', 'text-[var(--accent)]')
    cy.get('[data-testid="create-location-input"]').type('{backspace}')
    cy.get('[data-testid="create-location-soft-hint"]').should('not.exist')
    cy.get('[data-testid="create-location-counter"]').should('have.class', 'text-[var(--muted)]')
  })

  it('sends null for whitespace and normalises inner whitespace', () => {
    adminSetup()
    stubCreate()
    openCreateCard()
    cy.get('[data-testid="create-location-input"]').type('   ')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body.data.location').should('eq', null)

    openCreateCard()
    cy.get('[data-testid="create-location-input"]').type('  Sala   mare  ')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body.data.location').should('eq', 'Sala mare')
  })

  describe('edit', () => {
    const located = { ...adminItem, id: 'located', data: { title: 'Picnic', location: 'Parcul Central' } }

    beforeEach(() => adminSetup([located]))

    it('pre-fills the location and keeps it on save (regression: partial PATCH)', () => {
      cy.intercept('PATCH', '/api/admin/content/located', located).as('patch')
      openEdit('located')
      cy.get('[data-testid="create-location-input"]').should('have.value', 'Parcul Central')
      cy.get('[data-testid="create-submit-btn"]').click()
      cy.wait('@patch').its('request.body.data.location').should('eq', 'Parcul Central')
    })

    it('sends null when the location is cleared', () => {
      cy.intercept('PATCH', '/api/admin/content/located', located).as('patch')
      openEdit('located')
      cy.get('[data-testid="create-location-input"]').clear()
      cy.get('[data-testid="create-submit-btn"]').click()
      cy.wait('@patch').its('request.body.data').should('have.property', 'location', null)
    })

    it('translates the location with the same limit', () => {
      cy.intercept('PUT', '/api/admin/content/located/translations/en', {
        id: 't1', contentItemId: 'located', locale: 'en', data: {}, createdAt: '', updatedAt: '',
      }).as('saveTranslation')
      openEdit('located')
      cy.get('[data-testid="translation-locale-select"]').select('en')
      cy.get('[data-testid="trans-location-input"]')
        .should('have.attr', 'placeholder', 'Parcul Central')
        .and('have.attr', 'maxlength', '70')
      cy.get('[data-testid="trans-location-counter"]').should('have.text', '0 / 70')
      cy.get('[data-testid="trans-title-input"]').type('Picnic')
      cy.get('[data-testid="trans-location-input"]').type('Central Park')
      cy.get('[data-testid="trans-location-counter"]').should('have.text', '12 / 70')
      cy.get('[data-testid="create-submit-btn"]').click()
      cy.wait('@saveTranslation').its('request.body.data.location').should('eq', 'Central Park')
    })

    it('omits an empty translated location so the Romanian one applies', () => {
      cy.intercept('PUT', '/api/admin/content/located/translations/en', {
        id: 't1', contentItemId: 'located', locale: 'en', data: {}, createdAt: '', updatedAt: '',
      }).as('saveTranslation')
      openEdit('located')
      cy.get('[data-testid="translation-locale-select"]').select('en')
      cy.get('[data-testid="trans-title-input"]').type('Picnic')
      cy.get('[data-testid="create-submit-btn"]').click()
      cy.wait('@saveTranslation').its('request.body.data').should('not.have.property', 'location')
    })
  })
})

const publicItem = {
  state: 'published' as const, sites: [] as string[], orderPosition: 0, groupId: null,
  groupTitle: null, expiresAt: null, createdAt: '', updatedAt: '', type: 'card',
}

function visitPublic(items: object[], lang?: string, uiTranslations: Record<string, string> = {}) {
  cy.intercept('GET', '/api/sites', { sites: [] })
  stubI18nRoutes()
  if (lang) cy.intercept('GET', `/api/translations?locale=${lang}`, { locale: lang, translations: uiTranslations })
  cy.intercept('GET', '/api/content*', { site: null, items }).as('content')
  cy.visit('/', {
    onBeforeLoad(win) {
      if (lang) win.localStorage.setItem('betel-lang', lang)
      else win.localStorage.removeItem('betel-lang')
    },
  })
  cy.wait('@content')
}

describe('Public card — event location', () => {
  it('renders the location under the date row with a decorative pin and a hidden label', () => {
    visitPublic([{ ...publicItem, id: 'p-loc', data: { title: 'Seară de tineret', startDate: '2099-11-14', location: 'Sala mare' } }])
    cy.get('[data-testid="event-location"]').should('contain', 'Sala mare')
      .and(row => {
        expect(row.find('svg[aria-hidden="true"]')).to.have.length(1)
        expect(row.find('.sr-only').text()).to.contain('Loc de desfășurare')
      })
    cy.get('time').parent('p').next().should('have.attr', 'data-testid', 'event-location')
  })

  it('renders the location on a card without a date', () => {
    visitPublic([{ ...publicItem, id: 'p-undated', data: { title: 'Grup de rugăciune', location: 'Sala mică' } }])
    cy.contains('Grup de rugăciune').parents('article').within(() => {
      cy.get('time').should('not.exist')
      cy.get('[data-testid="event-location"]').should('contain', 'Sala mică')
        .prev().should('not.exist')
    })
  })

  it('renders nothing for an absent or blank location', () => {
    visitPublic([
      { ...publicItem, id: 'p-none', data: { title: 'Fără loc', startDate: '2099-11-14' } },
      { ...publicItem, id: 'p-empty', orderPosition: 1, data: { title: 'Loc gol', location: '' } },
      { ...publicItem, id: 'p-blank', orderPosition: 2, data: { title: 'Loc spații', location: '   ' } },
    ])
    cy.contains('Loc spații').should('be.visible')
    cy.get('[data-testid="event-location"]').should('not.exist')
  })

  it('renders the translated location and label', () => {
    visitPublic(
      [{ ...publicItem, id: 'p-en', data: { title: 'Youth night', startDate: '2099-11-14', location: 'Main hall' } }],
      'en', { 'location.label': 'Venue' },
    )
    cy.get('[data-testid="event-location"]').should('contain', 'Main hall')
      .find('.sr-only').should('contain', 'Venue')
  })

  it('renders the Romanian fallback in another language', () => {
    visitPublic(
      [{ ...publicItem, id: 'p-fallback', data: { title: 'Youth night', startDate: '2099-11-14', location: 'Sala mare' } }],
      'en', { 'location.label': 'Venue' },
    )
    cy.get('[data-testid="event-location"]').should('contain', 'Sala mare')
      .find('.sr-only').should('contain', 'Venue')
  })

  it('wraps a long location on a phone without overflowing', () => {
    const long = 'Casa de Cultură a Studenților, Sala Mare, Piața Lucian Blaga nr. 1-3'
    cy.viewport(360, 740)
    visitPublic([{ ...publicItem, id: 'p-long', data: { title: 'Concert', startDate: '2099-11-14', location: long } }])
    cy.get('[data-testid="event-location"]').should('contain', long)
    cy.get('article[data-item-id="p-long"]').should(article => {
      expect(article[0].scrollWidth).to.be.at.most(article[0].clientWidth)
    })
  })

  it('is never a link inside a linked card', () => {
    visitPublic([{ ...publicItem, id: 'p-link', data: { title: 'Concert', location: 'Sala mare', link: 'https://example.com' } }])
    cy.get('[data-testid="event-location"]').find('a').should('not.exist')
    cy.get('article[data-item-id="p-link"]').parents('a').should('have.length', 1)
  })
})
