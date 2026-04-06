/**
 * Admin mobile hamburger menu
 */
const ADMIN_URL = '/admin/'

const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'

function loginAsAdmin() {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [] }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] }).as('sites')
}

describe('Admin — mobile hamburger menu', () => {
  beforeEach(() => {
    loginAsAdmin()
    cy.viewport(375, 812) // iPhone-sized viewport
    cy.visit(ADMIN_URL, {
      onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) },
    })
    cy.wait('@me')
  })

  it('shows the hamburger button and hides nav links on mobile', () => {
    cy.get('[data-testid="hamburger-btn"]').should('be.visible')
    cy.get('[data-testid="mobile-menu"]').should('not.exist')
  })

  it('opens the mobile menu when hamburger is clicked', () => {
    cy.get('[data-testid="hamburger-btn"]').click()
    cy.get('[data-testid="mobile-menu"]').should('be.visible')
    cy.get('[data-testid="mobile-menu"]').contains('Conținut').should('be.visible')
    cy.get('[data-testid="mobile-menu"]').contains('Media').should('be.visible')
    cy.get('[data-testid="mobile-menu"]').contains('Statistici').should('be.visible')
    cy.get('[data-testid="mobile-menu"]').contains('Ieșire').should('be.visible')
  })

  it('closes the mobile menu after clicking a nav link', () => {
    cy.get('[data-testid="hamburger-btn"]').click()
    cy.get('[data-testid="mobile-menu"]').should('be.visible')
    cy.get('[data-testid="mobile-menu"]').contains('Media').click()
    cy.get('[data-testid="mobile-menu"]').should('not.exist')
  })

  it('closes the mobile menu when hamburger is clicked again', () => {
    cy.get('[data-testid="hamburger-btn"]').click()
    cy.get('[data-testid="mobile-menu"]').should('be.visible')
    cy.get('[data-testid="hamburger-btn"]').click()
    cy.get('[data-testid="mobile-menu"]').should('not.exist')
  })

  it('keeps BETEL ADMIN title visible on mobile', () => {
    cy.contains('BETEL ADMIN').should('be.visible')
  })
})
