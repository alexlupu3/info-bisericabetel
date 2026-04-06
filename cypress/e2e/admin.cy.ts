/**
 * Increment 4 — Admin auth and content management
 */
const ADMIN_URL = '/admin/'

const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [
  { slug: 'centru', name: 'Centru', accent: '#3b82f6' },
  { slug: 'vest', name: 'Vest', accent: '#22c55e' },
]

function loginViaApi() {
  cy.intercept('POST', '/api/auth/login', { token: mockToken, user: mockUser }).as('login')
  cy.intercept('GET',  '/api/auth/me',    mockUser).as('me')
  cy.intercept('GET',  '/api/admin/content', { items: [] }).as('content')
  cy.intercept('GET',  '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET',  '/api/sites', { sites: mockSites }).as('sites')
}

describe('Admin — login', () => {
  it('shows the login form', () => {
    cy.visit(ADMIN_URL)
    cy.get('[data-testid="login-form"]').should('be.visible')
    cy.get('[data-testid="login-email"]').should('exist')
    cy.get('[data-testid="login-password"]').should('exist')
    cy.get('[data-testid="login-submit"]').should('exist')
  })

  it('logs in with valid credentials and shows content page', () => {
    loginViaApi()
    cy.visit(ADMIN_URL)
    cy.get('[data-testid="login-email"]').type('admin@betel.ro')
    cy.get('[data-testid="login-password"]').type('password123')
    cy.get('[data-testid="login-submit"]').click()
    cy.wait('@login')
    cy.get('[data-testid="content-list"]').should('exist')
  })

  it('shows error on invalid credentials', () => {
    cy.intercept('POST', '/api/auth/login', { statusCode: 401, body: { error: 'Invalid credentials' } }).as('badLogin')
    cy.intercept('GET',  '/api/auth/me', { statusCode: 401 })
    cy.visit(ADMIN_URL)
    cy.get('[data-testid="login-email"]').type('wrong@betel.ro')
    cy.get('[data-testid="login-password"]').type('wrongpass')
    cy.get('[data-testid="login-submit"]').click()
    cy.wait('@badLogin')
    cy.get('[data-testid="login-error"]').should('be.visible').and('contain', 'Invalid credentials')
  })

  it('redirects to change-password page when mustChangePassword is true', () => {
    const forceChangeUser = { ...mockUser, mustChangePassword: true }
    cy.intercept('POST', '/api/auth/login', { token: mockToken, user: forceChangeUser })
    cy.intercept('GET',  '/api/auth/me', forceChangeUser)
    cy.visit(ADMIN_URL)
    cy.get('[data-testid="login-email"]').type('admin@betel.ro')
    cy.get('[data-testid="login-password"]').type('password123')
    cy.get('[data-testid="login-submit"]').click()
    cy.get('[data-testid="change-password-form"]').should('be.visible')
  })
})

describe('Admin — content management', () => {
  beforeEach(() => {
    loginViaApi()
    // Pre-seed localStorage with token so we skip the login form
    cy.visit(ADMIN_URL, {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('betel-admin-token', mockToken)
      },
    })
    cy.wait('@me')
  })

  it('shows the content list', () => {
    cy.get('[data-testid="content-list"]').should('exist')
    cy.get('[data-testid="create-content-btn"]').should('be.visible')
  })

  it('opens create form and creates a richtext item', () => {
    cy.intercept('POST', '/api/admin/content', {
      statusCode: 201,
      body: {
        id: 'new-1', type: 'richtext', state: 'draft',
        sites: [], orderPosition: 0, groupId: null,
        expiresAt: null, data: { body: 'Test body' }, createdAt: '', updatedAt: '',
      },
    }).as('createItem')
    cy.intercept('GET', '/api/admin/content', {
      items: [{
        id: 'new-1', type: 'richtext', state: 'draft',
        sites: [], orderPosition: 0, groupId: null,
        expiresAt: null, data: { body: 'Test body' }, createdAt: '', updatedAt: '',
      }],
    }).as('contentAfterCreate')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-form"]').should('be.visible')
    cy.get('[data-testid="create-type-select"]').select('richtext')
    cy.get('[data-testid="create-body-input"]').type('Test body')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@createItem')
    cy.get('[data-testid="content-list"]').should('exist')
  })

  it('publishes a draft item', () => {
    cy.intercept('GET', '/api/admin/content', {
      items: [{
        id: 'item-1', type: 'richtext', state: 'draft',
        sites: [], orderPosition: 0, groupId: null,
        expiresAt: null, data: { title: 'Draft item' }, createdAt: '', updatedAt: '',
      }],
    })
    cy.intercept('POST', '/api/admin/content/item-1/publish', {
      id: 'item-1', type: 'richtext', state: 'published',
      sites: [], orderPosition: 0, groupId: null,
      expiresAt: null, data: { title: 'Draft item' }, createdAt: '', updatedAt: '',
    }).as('publish')

    cy.reload()
    cy.get('[data-testid="content-row-item-1"]').should('exist')
    cy.get('[data-testid="item-menu-trigger-item-1"]').click()
    cy.get('[data-testid="item-menu-publish-item-1"]').click()
    cy.wait('@publish')
  })
})
