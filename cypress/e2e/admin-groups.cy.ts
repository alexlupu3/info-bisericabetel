/**
 * Group management is integrated into the Content page.
 */
const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [
  { slug: 'centru', name: 'Centru', accent: '#3b82f6' },
  { slug: 'vest', name: 'Vest', accent: '#22c55e' },
]

function setup(groups: object[] = []) {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [] }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: mockSites }).as('sites')
  cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) } })
  cy.wait('@me')
}

describe('Group management on content page', () => {
  it('shows the create group action on the content page', () => {
    setup()
    cy.get('[data-testid="create-group-btn"]').should('be.visible')
  })

  it('creates a group and shows it in the root list', () => {
    const newGroup = {
      id: 'g1', title: 'Anunțuri', sites: [], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '',
    }

    setup()
    cy.intercept('POST', '/api/admin/groups', { statusCode: 201, body: newGroup }).as('create')
    cy.intercept('GET', '/api/admin/groups', { groups: [newGroup] }).as('groupsAfter')

    cy.get('[data-testid="create-group-btn"]').click()
    cy.get('[data-testid="create-group-form"]').should('be.visible')
    cy.get('[data-testid="create-group-title"]').type('Anunțuri')
    cy.get('[data-testid="create-group-submit"]').click()
    cy.wait('@create').its('request.body.title').should('eq', 'Anunțuri')
    cy.wait('@groupsAfter')
    cy.get('[data-testid="group-block-g1"]').should('exist')
  })

  it('creates a group with site assignment', () => {
    setup()
    cy.intercept('POST', '/api/admin/groups', {
      statusCode: 201,
      body: {
        id: 'g2', title: 'Centru News', sites: ['centru'], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '',
      },
    }).as('create')

    cy.get('[data-testid="create-group-btn"]').click()
    cy.get('[data-testid="create-group-title"]').type('Centru News')
    cy.get('[data-testid="create-group-site-centru"]').check()
    cy.get('[data-testid="create-group-submit"]').click()
    cy.wait('@create').its('request.body.sites').should('include', 'centru')
  })

  it('deletes a group via the group context menu', () => {
    const group = {
      id: 'g1', title: 'Anunțuri', sites: [], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '',
    }

    setup([group])
    cy.intercept('DELETE', '/api/admin/groups/g1', { statusCode: 204 }).as('delete')

    cy.on('window:confirm', () => true)
    cy.get('[data-testid="group-block-g1"]').should('exist')
    cy.get('[data-testid="group-menu-trigger-g1"]').click()
    cy.get('[data-testid="group-menu-delete-g1"]').should('be.visible').click()
    cy.wait('@delete')
  })

  it('opens the group context menu and clicking Editează opens the edit panel', () => {
    const group = {
      id: 'g1', title: 'Anunțuri', sites: [], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '',
    }

    setup([group])

    cy.get('[data-testid="group-block-g1"]').should('exist')
    cy.get('[data-testid="group-menu-trigger-g1"]').click()
    cy.get('[data-testid="group-menu-edit-g1"]').should('be.visible').click()
    cy.get('[data-testid="edit-group-panel-g1"]').should('be.visible')
  })

  it('group context menu closes when clicking outside', () => {
    const group = {
      id: 'g1', title: 'Anunțuri', sites: [], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '',
    }

    setup([group])

    cy.get('[data-testid="group-menu-trigger-g1"]').click()
    cy.get('[data-testid="group-menu-edit-g1"]').should('be.visible')
    cy.get('body').click(0, 0)
    cy.get('[data-testid="group-menu-edit-g1"]').should('not.exist')
  })

  it('clicking the group title opens the group edit panel', () => {
    const group = {
      id: 'g1', title: 'Anunțuri', sites: [], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '',
    }

    setup([group])

    cy.get('[data-testid="group-name-g1"]').click()
    cy.get('[data-testid="edit-group-panel-g1"]').should('be.visible')
    cy.get('[data-testid="edit-group-title-g1"]').should('have.value', 'Anunțuri')
  })

  it('clicking the "+" button on a group header opens the content creation form pre-populated with that group', () => {
    const group = {
      id: 'g1', title: 'Anunțuri', sites: [], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '',
    }

    setup([group])

    // The + button should be visible in the group header
    cy.get('[data-testid="group-add-content-g1"]').should('be.visible')

    // Clicking the + button opens the create form
    cy.get('[data-testid="group-add-content-g1"]').click()
    cy.get('[data-testid="create-form"]').should('be.visible')

    // The form should have the group pre-selected — verify by submitting and checking the request body
    cy.intercept('POST', '/api/admin/content', (req) => {
      expect(req.body.groupId).to.eq('g1')
      req.reply({ statusCode: 201, body: { id: 'c1', type: 'card', state: 'draft', sites: [], groupId: 'g1', data: { title: 'Test' }, orderPosition: 0, createdAt: '', updatedAt: '' } })
    }).as('createContent')
    cy.intercept('GET', '/api/admin/content', { items: [] }).as('contentAfter')

    cy.get('[data-testid="create-title-input"]').type('Test')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@createContent')
  })
})
