const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [
  { slug: 'centru', name: 'Centru', accent: '#3b82f6' },
  { slug: 'vest', name: 'Vest', accent: '#22c55e' },
]

const mockItem = {
  id: 'item-1',
  type: 'card',
  state: 'published',
  sites: [],
  exclusiveSite: null,
  orderPosition: 0,
  groupId: null,
  expiresAt: null,
  data: {
    title: 'Program Duminică',
    link: 'https://betel.ro/program',
    siteLinks: { centru: 'https://betel.ro/centru/program' },
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const mockShortLink1 = {
  id: 'sl-1',
  code: 'abc123',
  label: 'WhatsApp Manastur',
  contentItemId: 'item-1',
  siteSlug: null,
  createdAt: '2026-01-01T00:00:00Z',
  clickCount: 12,
}

const mockShortLink2 = {
  id: 'sl-2',
  code: 'def456',
  label: 'QR cod intrare',
  contentItemId: 'item-1',
  siteSlug: 'centru',
  createdAt: '2026-01-02T00:00:00Z',
  clickCount: 5,
}

function setup() {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [mockItem] }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: mockSites }).as('sites')
  cy.intercept('GET', '/api/admin/languages', { languages: [] }).as('languages')
  cy.intercept('GET', '/api/admin/content/*/translations', { translations: [] }).as('translations')
  cy.visit(ADMIN_URL, {
    onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) },
  })
  cy.wait('@me')
}

function openShortLinksTab() {
  cy.get(`[data-testid="content-name-item-1"]`).click()
  cy.get('[data-testid="tab-short-links"]').click()
}

describe('Admin — Short Links tab', () => {
  beforeEach(setup)

  it('shows the Short Links tab when editing a content item', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')
    cy.get(`[data-testid="content-name-item-1"]`).click()
    cy.get('[data-testid="tab-edit"]').should('be.visible')
    cy.get('[data-testid="tab-short-links"]').should('be.visible')
  })

  it('opens the Short Links tab and shows empty state', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')
    openShortLinksTab()
    cy.wait('@shortLinks')
    cy.contains('Niciun link scurt').should('be.visible')
  })

  it('displays existing short links with click counts', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', {
      shortLinks: [mockShortLink1, mockShortLink2],
    }).as('shortLinks')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.get(`[data-testid="short-link-row-sl-1"]`).should('contain', 'WhatsApp Manastur')
    cy.get(`[data-testid="short-link-row-sl-1"]`).should('contain', '12')
    cy.get(`[data-testid="short-link-row-sl-2"]`).should('contain', 'QR cod intrare')
    cy.get(`[data-testid="short-link-row-sl-2"]`).should('contain', '5')
  })

  it('creates a new short link with a label', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')
    cy.intercept('POST', '/api/admin/content/*/short-links', {
      statusCode: 201,
      body: { ...mockShortLink1, clickCount: 0 },
    }).as('create')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.contains('+ Link nou').click()
    cy.get('[data-testid="short-link-label-input"]').type('WhatsApp Manastur')

    cy.intercept('GET', '/api/admin/content/*/short-links', {
      shortLinks: [{ ...mockShortLink1, clickCount: 0 }],
    }).as('shortLinksRefetch')

    cy.get('[data-testid="short-link-create-btn"]').click()
    cy.wait('@create').its('request.body').should('deep.include', { label: 'WhatsApp Manastur' })
    cy.wait('@shortLinksRefetch')
    cy.get('[data-testid="short-link-row-sl-1"]').should('be.visible')
  })

  it('shows site override dropdown when item has site links', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.contains('+ Link nou').click()
    // The item has siteLinks.centru defined, so the dropdown should appear
    cy.get('[data-testid="short-link-site-select"]').should('be.visible')
    cy.get('[data-testid="short-link-site-select"]').should('contain', 'Centru')
    // Vest has no siteLinks override on the item, so it must not appear
    cy.get('[data-testid="short-link-site-select"]').should('not.contain', 'Vest')
  })

  it('creates a short link with a site override', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')
    cy.intercept('POST', '/api/admin/content/*/short-links', {
      statusCode: 201,
      body: { ...mockShortLink2, clickCount: 0 },
    }).as('create')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.contains('+ Link nou').click()
    cy.get('[data-testid="short-link-label-input"]').type('QR cod intrare')
    cy.get('[data-testid="short-link-site-select"]').select('centru')

    cy.intercept('GET', '/api/admin/content/*/short-links', {
      shortLinks: [{ ...mockShortLink2, clickCount: 0 }],
    }).as('shortLinksRefetch')

    cy.get('[data-testid="short-link-create-btn"]').click()
    cy.wait('@create').its('request.body').should('deep.include', { siteSlug: 'centru' })
  })

  it('deletes a short link after confirmation', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', {
      shortLinks: [mockShortLink1],
    }).as('shortLinks')
    cy.intercept('DELETE', '/api/admin/content/*/short-links/sl-1', {
      statusCode: 204,
    }).as('delete')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinksRefetch')

    cy.window().then(win => cy.stub(win, 'confirm').returns(true))
    cy.get('[data-testid="short-link-delete-sl-1"]').click()
    cy.wait('@delete')
    cy.wait('@shortLinksRefetch')
    cy.contains('Niciun link scurt').should('be.visible')
  })

  it('disables create button when label is empty', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.contains('+ Link nou').click()
    cy.get('[data-testid="short-link-create-btn"]').should('be.disabled')
    cy.get('[data-testid="short-link-label-input"]').type('x')
    cy.get('[data-testid="short-link-create-btn"]').should('not.be.disabled')
  })

  it('cancels creation form without making a request', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.contains('+ Link nou').click()
    cy.get('[data-testid="short-link-label-input"]').should('be.visible')
    cy.contains('Anulează').first().click()
    cy.get('[data-testid="short-link-label-input"]').should('not.exist')
  })
})
