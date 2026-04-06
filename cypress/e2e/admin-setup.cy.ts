/**
 * One-time super-admin setup flow
 */
const ADMIN_URL = '/admin/'
const mockSites = [{ slug: 'centru', name: 'Centru', accent: '#3b82f6' }]

describe('Admin — initial setup', () => {
  it('shows setup link on login page', () => {
    cy.intercept('GET', '/api/auth/me', { statusCode: 401 })
    cy.visit(ADMIN_URL)
    cy.get('[data-testid="setup-link"]').should('be.visible')
  })

  it('navigates to setup page', () => {
    cy.intercept('GET', '/api/auth/me', { statusCode: 401 })
    cy.visit(ADMIN_URL)
    cy.get('[data-testid="setup-link"]').click()
    cy.get('[data-testid="setup-form"]').should('be.visible')
  })

  it('creates super-admin and auto-logs in', () => {
    const mockUser = { id: 'u1', email: 'alex@betel.ro', role: 'super-admin', mustChangePassword: false }
    let meCallCount = 0
    cy.intercept('GET', '/api/auth/me', req => {
      req.reply(meCallCount++ === 0 ? { statusCode: 401 } : mockUser)
    })
    cy.intercept('POST', '/api/setup', { statusCode: 201, body: mockUser }).as('setup')
    cy.intercept('POST', '/api/auth/login', { token: 'tok', user: mockUser }).as('login')
    cy.intercept('GET', '/api/admin/content', { items: [] })
    cy.intercept('GET', '/api/admin/groups', { groups: [] })
    cy.intercept('GET', '/api/sites', { sites: mockSites })

    cy.visit(`${ADMIN_URL}setup`)
    cy.get('[data-testid="setup-email"]').type('alex@betel.ro')
    cy.get('[data-testid="setup-password"]').type('secret123')
    cy.get('[data-testid="setup-confirm"]').type('secret123')
    cy.get('[data-testid="setup-submit"]').click()
    cy.wait('@setup')
    cy.wait('@login')
    cy.get('[data-testid="content-list"]').should('exist')
  })

  it('shows error when setup already complete', () => {
    cy.intercept('GET', '/api/auth/me', { statusCode: 401 })
    cy.intercept('POST', '/api/setup', { statusCode: 409, body: { error: 'Setup already complete' } }).as('setupFail')

    cy.visit(`${ADMIN_URL}setup`)
    cy.get('[data-testid="setup-email"]').type('alex@betel.ro')
    cy.get('[data-testid="setup-password"]').type('secret123')
    cy.get('[data-testid="setup-confirm"]').type('secret123')
    cy.get('[data-testid="setup-submit"]').click()
    cy.wait('@setupFail')
    cy.get('[data-testid="setup-error"]').should('contain', 'Setup already complete')
  })
})
