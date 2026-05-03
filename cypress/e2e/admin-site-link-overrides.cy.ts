/**
 * Per-site link overrides — admin form
 *
 * Covers the SiteLinkOverrides component that appears below the link field
 * for card and poster content types.
 */
const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [
  { slug: 'centru', name: 'Centru', accent: '#3b82f6' },
  { slug: 'vest',   name: 'Vest',   accent: '#22c55e' },
]

function setup(items: object[] = []) {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: mockSites }).as('sites')
  cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) } })
  cy.wait('@me')
}

describe('Admin — per-site link overrides: visibility', () => {
  beforeEach(() => setup())

  it('overrides toggle is hidden when no link is set', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('card')
    cy.get('[data-testid="create-title-input"]').type('Donatii')
    cy.get('[data-testid="site-link-overrides-toggle"]').should('not.exist')
  })

  it('overrides toggle appears after entering a link', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('card')
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro/donate')
    cy.get('[data-testid="site-link-overrides-toggle"]').should('be.visible')
  })

  it('overrides toggle disappears when link is cleared', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('card')
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro/donate')
    cy.get('[data-testid="site-link-overrides-toggle"]').should('be.visible')
    cy.get('[data-testid="create-link-input"]').clear()
    cy.get('[data-testid="site-link-overrides-toggle"]').should('not.exist')
  })

  it('overrides section is collapsed by default', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro/donate')
    cy.get('[data-testid="site-link-input-centru"]').should('not.exist')
  })

  it('clicking toggle expands the overrides section', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro/donate')
    cy.get('[data-testid="site-link-overrides-toggle"]').click()
    cy.get('[data-testid="site-link-input-centru"]').should('be.visible')
    cy.get('[data-testid="site-link-input-vest"]').should('be.visible')
  })

  it('clicking toggle again collapses the section', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro/donate')
    cy.get('[data-testid="site-link-overrides-toggle"]').click()
    cy.get('[data-testid="site-link-input-centru"]').should('be.visible')
    cy.get('[data-testid="site-link-overrides-toggle"]').click()
    cy.get('[data-testid="site-link-input-centru"]').should('not.exist')
  })

  it('shows inputs for all sites when item is unscoped', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro/donate')
    cy.get('[data-testid="site-link-overrides-toggle"]').click()
    cy.get('[data-testid="site-link-input-centru"]').should('exist')
    cy.get('[data-testid="site-link-input-vest"]').should('exist')
  })

  it('shows inputs only for scoped sites', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro/donate')
    cy.get('[data-testid="site-check-centru"]').check()
    cy.get('[data-testid="site-link-overrides-toggle"]').click()
    cy.get('[data-testid="site-link-input-centru"]').should('exist')
    cy.get('[data-testid="site-link-input-vest"]').should('not.exist')
  })

  it('also shows overrides toggle for poster type', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('poster')
    cy.get('[data-testid="site-link-overrides-toggle"]').should('not.exist')
    // Simulate a link being present via the input
    cy.get('input[placeholder="https://..."]').type('https://betel.ro/poster')
    cy.get('[data-testid="site-link-overrides-toggle"]').should('be.visible')
  })

  it('does not show overrides toggle for richtext type', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('richtext')
    cy.get('[data-testid="site-link-overrides-toggle"]').should('not.exist')
  })

  it('does not show overrides toggle for video type', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('video')
    cy.get('[data-testid="site-link-overrides-toggle"]').should('not.exist')
  })
})

describe('Admin — per-site link overrides: saving', () => {
  beforeEach(() => setup())

  it('includes siteLinks in the payload when a site override is set', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: {
      id: 'c1', type: 'card', state: 'draft', sites: [], orderPosition: 0,
      groupId: null, expiresAt: null, data: {}, createdAt: '', updatedAt: '',
    }}).as('create')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-title-input"]').type('Donații')
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro/donate')
    cy.get('[data-testid="site-link-overrides-toggle"]').click()
    cy.get('[data-testid="site-link-input-centru"]').type('https://betel-centru.ro/donate')
    cy.get('[data-testid="create-submit-btn"]').click()

    cy.wait('@create').its('request.body').should(body => {
      expect(body.data.link).to.eq('https://betel.ro/donate')
      expect(body.data.siteLinks).to.deep.eq({ centru: 'https://betel-centru.ro/donate' })
    })
  })

  it('omits siteLinks from the payload when all overrides are empty', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: {
      id: 'c2', type: 'card', state: 'draft', sites: [], orderPosition: 0,
      groupId: null, expiresAt: null, data: {}, createdAt: '', updatedAt: '',
    }}).as('create')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-title-input"]').type('Donații')
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro/donate')
    cy.get('[data-testid="site-link-overrides-toggle"]').click()
    // Leave overrides empty — do not type into site-link inputs
    cy.get('[data-testid="create-submit-btn"]').click()

    cy.wait('@create').its('request.body').should(body => {
      expect(body.data).not.to.have.property('siteLinks')
    })
  })

  it('saves only non-empty overrides when some inputs are blank', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: {
      id: 'c3', type: 'card', state: 'draft', sites: [], orderPosition: 0,
      groupId: null, expiresAt: null, data: {}, createdAt: '', updatedAt: '',
    }}).as('create')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-title-input"]').type('Donații')
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro/donate')
    cy.get('[data-testid="site-link-overrides-toggle"]').click()
    cy.get('[data-testid="site-link-input-centru"]').type('https://betel-centru.ro/donate')
    // Leave Vest empty
    cy.get('[data-testid="create-submit-btn"]').click()

    cy.wait('@create').its('request.body').should(body => {
      expect(body.data.siteLinks).to.deep.eq({ centru: 'https://betel-centru.ro/donate' })
      expect(body.data.siteLinks).not.to.have.property('vest')
    })
  })
})

describe('Admin — per-site link overrides: edit mode', () => {
  it('pre-fills existing siteLinks and auto-expands when overrides are present', () => {
    setup([{
      id: 'item-1', type: 'card', state: 'draft', sites: [], orderPosition: 0,
      groupId: null, expiresAt: null, createdAt: '', updatedAt: '',
      data: {
        title: 'Donații',
        link: 'https://betel.ro/donate',
        siteLinks: { centru: 'https://betel-centru.ro/donate' },
      },
    }])

    cy.get('[data-testid="item-menu-trigger-item-1"]').click()
    cy.get('[data-testid="item-menu-edit-item-1"]').click()

    // Section should be expanded because overrides exist
    cy.get('[data-testid="site-link-input-centru"]').should('be.visible')
      .and('have.value', 'https://betel-centru.ro/donate')
    cy.get('[data-testid="site-link-input-vest"]').should('be.visible')
      .and('have.value', '')
  })

  it('sends updated siteLinks on PATCH', () => {
    setup([{
      id: 'item-2', type: 'card', state: 'draft', sites: [], orderPosition: 0,
      groupId: null, expiresAt: null, createdAt: '', updatedAt: '',
      data: {
        title: 'Donații',
        link: 'https://betel.ro/donate',
        siteLinks: { centru: 'https://betel-centru.ro/donate' },
      },
    }])
    cy.intercept('PATCH', '/api/admin/content/item-2', { statusCode: 200, body: {} }).as('patch')

    cy.get('[data-testid="item-menu-trigger-item-2"]').click()
    cy.get('[data-testid="item-menu-edit-item-2"]').click()
    cy.get('[data-testid="site-link-input-vest"]').type('https://betel-vest.ro/donate')
    cy.get('[data-testid="create-submit-btn"]').click()

    cy.wait('@patch').its('request.body').should(body => {
      expect(body.data.siteLinks).to.deep.eq({
        centru: 'https://betel-centru.ro/donate',
        vest:   'https://betel-vest.ro/donate',
      })
    })
  })
})

export {}
