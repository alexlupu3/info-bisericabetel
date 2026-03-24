/**
 * Increment 5 — Super-admin user management
 */
const ADMIN_URL = 'http://localhost:5174/admin/'

const mockSuperAdmin = { id: 'u1', email: 'superadmin@betel.ro', role: 'super-admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [{ slug: 'centru', name: 'Centru', accent: '#3b82f6' }]

function loginAsSuperAdmin() {
  cy.intercept('GET', '/api/auth/me', mockSuperAdmin).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [] }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: mockSites }).as('sites')
  cy.intercept('GET', '/api/admin/users', {
    users: [
      { id: 'u1', email: 'superadmin@betel.ro', role: 'super-admin', mustChangePassword: false },
      { id: 'u2', email: 'admin@betel.ro',      role: 'admin',       mustChangePassword: true  },
    ],
  }).as('users')
}

describe('Admin — users (super-admin only)', () => {
  beforeEach(() => {
    loginAsSuperAdmin()
    cy.visit(ADMIN_URL, {
      onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) },
    })
    cy.wait('@me')
  })

  it('shows Utilizatori nav link for super-admin', () => {
    cy.contains('Utilizatori').should('be.visible')
  })

  it('shows the users list', () => {
    cy.contains('Utilizatori').click()
    cy.wait('@users')
    cy.get('[data-testid="users-list"]').should('exist')
    cy.get('[data-testid="user-row-u2"]').should('exist')
    cy.get('[data-testid="user-row-u2"]').contains('parolă temp')
  })

  it('creates a new user and shows the temp password', () => {
    cy.intercept('POST', '/api/admin/users', {
      statusCode: 201,
      body: { id: 'u3', email: 'nou@betel.ro', role: 'admin', mustChangePassword: true, tempPassword: 'abc123xyz' },
    }).as('createUser')

    cy.contains('Utilizatori').click()
    cy.wait('@users')
    cy.get('[data-testid="create-user-btn"]').click()
    cy.get('[data-testid="create-user-form"]').should('be.visible')
    cy.get('[data-testid="create-user-email"]').type('nou@betel.ro')
    cy.get('[data-testid="create-user-role"]').select('admin')
    cy.get('[data-testid="create-user-submit"]').click()
    cy.wait('@createUser')
    cy.get('[data-testid="temp-password-display"]').should('be.visible')
    cy.get('[data-testid="temp-password-value"]').should('contain', 'abc123xyz')
  })

  it('resets password for admin user and shows temp password', () => {
    cy.intercept('POST', '/api/admin/users/u2/reset-password', {
      statusCode: 200,
      body: { tempPassword: 'reset123xy' },
    }).as('resetPassword')

    cy.contains('Utilizatori').click()
    cy.wait('@users')
    cy.get('[data-testid="reset-password-btn-u2"]').should('be.visible')
    cy.get('[data-testid="reset-password-btn-u2"]').click()
    cy.wait('@resetPassword')
    cy.get('[data-testid="reset-password-display"]').should('be.visible')
    cy.get('[data-testid="reset-password-value"]').should('contain', 'reset123xy')
  })

  it('does not show reset password button for super-admin users', () => {
    cy.contains('Utilizatori').click()
    cy.wait('@users')
    cy.get('[data-testid="user-row-u1"]').find('[data-testid^="reset-password-btn"]').should('not.exist')
  })

  it('hides Utilizatori nav link for regular admin', () => {
    const regularAdmin = { id: 'u2', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
    cy.intercept('GET', '/api/auth/me', regularAdmin)
    cy.reload()
    cy.contains('Utilizatori').should('not.exist')
  })
})
