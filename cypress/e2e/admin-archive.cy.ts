/**
 * Soft-delete (archive) — content items
 */
const ADMIN_URL = '/admin/'

const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [
  { slug: 'centru', name: 'Centru', accent: '#3b82f6' },
]

const draftItem = {
  id: 'item-1', type: 'card' as const, state: 'draft',
  sites: [], orderPosition: 0, groupId: null,
  expiresAt: null, data: { title: 'Draft card' }, createdAt: '', updatedAt: '2026-04-19T10:00:00Z',
}

const deletedItem = {
  ...draftItem, state: 'deleted', data: { title: 'Deleted card' },
}

function loginAndVisit(path = '') {
  cy.intercept('POST', '/api/auth/login', { token: mockToken, user: mockUser })
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/sites', { sites: mockSites })
  cy.visit(ADMIN_URL + path, {
    onBeforeLoad(win) {
      win.sessionStorage.setItem('betel-admin-token', mockToken)
    },
  })
  cy.wait('@me')
}

describe('Admin — soft delete', () => {
  it('delete button soft-deletes a content item', () => {
    cy.intercept('GET', '/api/admin/content', { items: [draftItem] })
    cy.intercept('GET', '/api/admin/groups', { groups: [] })
    cy.intercept('DELETE', '/api/admin/content/item-1', { statusCode: 204 }).as('softDelete')

    loginAndVisit('content')
    cy.get('[data-testid="content-row-item-1"]').should('exist')

    // Set up the post-delete response before triggering delete
    cy.intercept('GET', '/api/admin/content', { items: [] })
    cy.get('[data-testid="item-menu-trigger-item-1"]').click()
    cy.get('[data-testid="item-menu-delete-item-1"]').click()
    cy.wait('@softDelete')
  })

  it('published item shows Ascunde instead of Arhivează', () => {
    const publishedItem = { ...draftItem, state: 'published' }
    cy.intercept('GET', '/api/admin/content', { items: [publishedItem] })
    cy.intercept('GET', '/api/admin/groups', { groups: [] })

    loginAndVisit('content')
    cy.get('[data-testid="item-menu-trigger-item-1"]').click()
    cy.get('[data-testid="item-menu-hide-item-1"]').should('be.visible')
    cy.get('[data-testid="item-menu-archive-item-1"]').should('not.exist')
  })
})

describe('Admin — archive page', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/admin/content/deleted', { items: [deletedItem] }).as('deleted')
    loginAndVisit('archive')
  })

  it('shows the archive page with deleted items', () => {
    cy.wait('@deleted')
    cy.get('[data-testid="archive-list"]').should('exist')
    cy.get('[data-testid="archive-row-item-1"]').should('exist')
    cy.contains('Deleted card').should('be.visible')
  })

  it('restores a deleted item', () => {
    cy.intercept('POST', '/api/admin/content/item-1/restore', {
      ...deletedItem, state: 'draft',
    }).as('restore')
    cy.intercept('GET', '/api/admin/content/deleted', { items: [] }).as('deletedAfter')

    cy.wait('@deleted')
    cy.get('[data-testid="restore-btn-item-1"]').click()
    cy.wait('@restore')
    cy.get('[data-testid="archive-empty"]').should('be.visible')
  })

  it('permanently deletes an item', () => {
    cy.intercept('DELETE', '/api/admin/content/item-1/permanent', { statusCode: 204 }).as('permDelete')

    cy.wait('@deleted')
    cy.get('[data-testid="archive-row-item-1"]').should('exist')

    // Set up post-delete response before triggering delete
    cy.intercept('GET', '/api/admin/content/deleted', { items: [] })
    cy.get('[data-testid="permanent-delete-btn-item-1"]').click()
    cy.wait('@permDelete')
    cy.get('[data-testid="archive-empty"]').should('be.visible')
  })

  it('shows empty state when no deleted items', () => {
    cy.intercept('GET', '/api/admin/content/deleted', { items: [] }).as('emptyDeleted')
    loginAndVisit('archive')
    cy.wait('@emptyDeleted')
    cy.get('[data-testid="archive-empty"]').should('be.visible')
    cy.contains('Niciun element în arhivă').should('be.visible')
  })
})

describe('Admin — group delete cascades soft-delete', () => {
  it('deleting a group soft-deletes its child items', () => {
    const group = { id: 'g1', title: 'Test Group', sites: [], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '' }
    const groupItem = { ...draftItem, groupId: 'g1', data: { title: 'Grouped card' } }

    cy.intercept('GET', '/api/admin/content', { items: [groupItem] })
    cy.intercept('GET', '/api/admin/groups', { groups: [group] })
    cy.intercept('DELETE', '/api/admin/groups/g1', { statusCode: 204 }).as('deleteGroup')

    loginAndVisit('content')
    cy.get('[data-testid="group-menu-trigger-g1"]').should('be.visible')

    // Set up post-delete responses before triggering delete
    cy.intercept('GET', '/api/admin/content', { items: [] })
    cy.intercept('GET', '/api/admin/groups', { groups: [] })
    cy.get('[data-testid="group-menu-trigger-g1"]').click()
    cy.get('[data-testid="group-menu-delete-g1"]').click()
    cy.wait('@deleteGroup')
  })
})
