/**
 * Publish toggle switch on content rows
 */
const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [{ slug: 'centru', name: 'Centru', accent: '#3b82f6' }]

function setup(items: object[]) {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: mockSites }).as('sites')
  cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) } })
  cy.wait('@me')
  cy.wait('@content')
}

describe('Admin — publish toggle switch', () => {
  it('shows a toggle switch next to each content item status', () => {
    const item = {
      id: 'item-1', type: 'card', state: 'draft', sites: [],
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { title: 'Test Card' }, createdAt: '', updatedAt: '',
    }
    setup([item])

    cy.get('[data-testid="publish-toggle-item-1"]').should('exist')
    cy.get('[data-testid="publish-toggle-item-1"]').should('have.attr', 'aria-checked', 'false')
  })

  it('shows toggle as ON (checked) for published items', () => {
    const item = {
      id: 'item-1', type: 'card', state: 'published', sites: [],
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { title: 'Published Card' }, createdAt: '', updatedAt: '',
    }
    setup([item])

    cy.get('[data-testid="publish-toggle-item-1"]').should('have.attr', 'aria-checked', 'true')
  })

  it('toggling ON a draft item calls the publish API', () => {
    const draftItem = {
      id: 'item-1', type: 'card', state: 'draft', sites: [],
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { title: 'Draft Card' }, createdAt: '', updatedAt: '',
    }
    setup([draftItem])

    cy.intercept('POST', '/api/admin/content/item-1/publish', {
      statusCode: 200,
      body: { ...draftItem, state: 'published' },
    }).as('publish')
    cy.intercept('GET', '/api/admin/content', {
      items: [{ ...draftItem, state: 'published' }],
    }).as('contentRefresh')

    cy.get('[data-testid="publish-toggle-item-1"]').click()
    cy.wait('@publish')
    cy.get('[data-testid="toast"]').should('be.visible').and('contain', 'Publicat')
  })

  it('toggling OFF a published item calls the update API to set state to draft', () => {
    const publishedItem = {
      id: 'item-2', type: 'card', state: 'published', sites: [],
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { title: 'Published Card' }, createdAt: '', updatedAt: '',
    }
    setup([publishedItem])

    cy.intercept('PATCH', '/api/admin/content/item-2', {
      statusCode: 200,
      body: { ...publishedItem, state: 'draft' },
    }).as('unpublish')
    cy.intercept('GET', '/api/admin/content', {
      items: [{ ...publishedItem, state: 'draft' }],
    }).as('contentRefresh')

    cy.get('[data-testid="publish-toggle-item-2"]').click()
    cy.wait('@unpublish')
    cy.get('[data-testid="toast"]').should('be.visible').and('contain', 'Depublicat')
  })

  it('performs optimistic update — switch flips immediately before API responds', () => {
    const draftItem = {
      id: 'item-3', type: 'card', state: 'draft', sites: [],
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { title: 'Optimistic Card' }, createdAt: '', updatedAt: '',
    }
    setup([draftItem])

    cy.intercept('POST', '/api/admin/content/item-3/publish', (req) => {
      req.reply({ statusCode: 200, body: { ...draftItem, state: 'published' }, delay: 500 })
    }).as('slowPublish')
    cy.intercept('GET', '/api/admin/content', { items: [{ ...draftItem, state: 'published' }] })

    cy.get('[data-testid="publish-toggle-item-3"]').click()
    // Optimistic update: aria-checked should flip immediately, before API resolves
    cy.get('[data-testid="publish-toggle-item-3"]').should('have.attr', 'aria-checked', 'true')
    cy.wait('@slowPublish')
  })
})

describe('Admin — publish/archive via context menu', () => {
  const draftItem = {
    id: 'item-ctx-1', type: 'card', state: 'draft', sites: [],
    orderPosition: 0, groupId: null, expiresAt: null,
    data: { title: 'Context Menu Card' }, createdAt: '', updatedAt: '',
  }
  const publishedItem = {
    id: 'item-ctx-2', type: 'card', state: 'published', sites: [],
    orderPosition: 1, groupId: null, expiresAt: null,
    data: { title: 'Published Context Card' }, createdAt: '', updatedAt: '',
  }

  it('toggle switch and state label are visible without opening the context menu', () => {
    setup([draftItem])

    // Toggle switch is always visible
    cy.get('[data-testid="publish-toggle-item-ctx-1"]').should('exist').and('be.visible')
    // State label is always visible
    cy.get('[data-testid="content-row-item-ctx-1"]').should('contain.text', 'draft')
    // Context menu is closed by default
    cy.get('[data-testid="item-menu-publish-item-ctx-1"]').should('not.exist')
  })

  it('context menu shows "Publică" for draft items and clicking it calls the publish API', () => {
    setup([draftItem])

    cy.intercept('POST', '/api/admin/content/item-ctx-1/publish', {
      statusCode: 200,
      body: { ...draftItem, state: 'published' },
    }).as('publish')
    cy.intercept('GET', '/api/admin/content', {
      items: [{ ...draftItem, state: 'published' }],
    }).as('contentRefresh')

    cy.get('[data-testid="item-menu-trigger-item-ctx-1"]').click()
    cy.get('[data-testid="item-menu-publish-item-ctx-1"]').should('be.visible').click()
    cy.wait('@publish')
    cy.get('[data-testid="toast"]').should('be.visible').and('contain', 'Publicat')
  })

  it('context menu does not show "Arhivează" for draft items', () => {
    setup([draftItem])

    cy.get('[data-testid="item-menu-trigger-item-ctx-1"]').click()
    cy.get('[data-testid="item-menu-archive-item-ctx-1"]').should('not.exist')
  })

  it('context menu shows "Arhivează" for published items and clicking it calls the archive API', () => {
    setup([publishedItem])

    cy.intercept('POST', '/api/admin/content/item-ctx-2/archive', {
      statusCode: 200,
      body: { ...publishedItem, state: 'archived' },
    }).as('archive')
    cy.intercept('GET', '/api/admin/content', {
      items: [{ ...publishedItem, state: 'archived' }],
    }).as('contentRefresh')

    cy.get('[data-testid="item-menu-trigger-item-ctx-2"]').click()
    cy.get('[data-testid="item-menu-archive-item-ctx-2"]').should('be.visible').click()
    cy.wait('@archive')
    cy.get('[data-testid="toast"]').should('be.visible').and('contain', 'Arhivat')
  })

  it('context menu does not show "Publică" for published items', () => {
    setup([publishedItem])

    cy.get('[data-testid="item-menu-trigger-item-ctx-2"]').click()
    cy.get('[data-testid="item-menu-publish-item-ctx-2"]').should('not.exist')
  })

  it('toggle switch and state label remain visible after opening and closing the context menu', () => {
    setup([publishedItem])

    // Open the menu
    cy.get('[data-testid="item-menu-trigger-item-ctx-2"]').click()
    cy.get('[data-testid="item-menu-archive-item-ctx-2"]').should('be.visible')

    // Close by clicking outside
    cy.get('body').click(0, 0)

    // Toggle and state label are still visible
    cy.get('[data-testid="publish-toggle-item-ctx-2"]').should('exist').and('be.visible')
    cy.get('[data-testid="content-row-item-ctx-2"]').should('contain.text', 'published')
  })
})
