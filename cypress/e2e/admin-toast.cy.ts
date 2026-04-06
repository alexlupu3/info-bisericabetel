/**
 * Toast notifications
 */
const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [{ slug: 'centru', name: 'Centru', accent: '#3b82f6' }]

function setup() {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [] })
  cy.intercept('GET', '/api/admin/groups', { groups: [] })
  cy.intercept('GET', '/api/sites', { sites: mockSites })
  cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) } })
  cy.wait('@me')
}

describe('Toast notifications', () => {
  beforeEach(setup)

  it('shows a success toast after creating content', () => {
    const newItem = {
      id: 'c1', type: 'richtext', state: 'draft', sites: [],
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { body: 'hello' }, createdAt: '', updatedAt: '',
    }
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: newItem }).as('create')
    cy.intercept('GET', '/api/admin/content', { items: [newItem] })

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('richtext')
    cy.get('[data-testid="create-body-input"]').type('hello')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create')
    cy.get('[data-testid="toast"]').should('be.visible').and('contain', 'Element creat')
  })

  it('shows a success toast after publishing content', () => {
    const item = {
      id: 'c1', type: 'richtext', state: 'draft', sites: [],
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { body: 'hello' }, createdAt: '', updatedAt: '',
    }
    cy.intercept('GET', '/api/admin/content', { items: [item] })
    cy.intercept('POST', '/api/admin/content/c1/publish', { statusCode: 200, body: { ...item, state: 'published' } }).as('publish')
    cy.reload()
    cy.wait('@me')

    cy.get('[data-testid="item-menu-trigger-c1"]').click()
    cy.get('[data-testid="item-menu-publish-c1"]').click()
    cy.wait('@publish')
    cy.get('[data-testid="toast"]').should('be.visible').and('contain', 'Publicat')
  })

  it('shows a success toast after deleting content', () => {
    const item = {
      id: 'c1', type: 'richtext', state: 'draft', sites: [],
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { body: 'hello' }, createdAt: '', updatedAt: '',
    }
    cy.intercept('GET', '/api/admin/content', { items: [item] })
    cy.intercept('DELETE', '/api/admin/content/c1', { statusCode: 204 }).as('delete')
    cy.reload()
    cy.wait('@me')

    cy.on('window:confirm', () => true)
    cy.get('[data-testid="item-menu-trigger-c1"]').click()
    cy.get('[data-testid="item-menu-delete-c1"]').click()
    cy.wait('@delete')
    cy.get('[data-testid="toast"]').should('be.visible').and('contain', 'șters')
  })
})
