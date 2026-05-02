const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'

const cardItem = {
  id: 'c1', type: 'card', state: 'draft', sites: [], exclusiveSite: null,
  orderPosition: 0, groupId: null, expiresAt: null,
  data: { title: 'Anunț important', thumbnail: '/uploads/thumb.jpg' },
  createdAt: '', updatedAt: '',
}

const groupItem = {
  id: 'c2', type: 'card', state: 'draft', sites: [], exclusiveSite: null,
  orderPosition: 1, groupId: 'g1', expiresAt: null,
  data: { title: 'Card în grup' },
  createdAt: '', updatedAt: '',
}

const group = {
  id: 'g1', title: 'Grup test', sites: [], orderPosition: 2, state: 'draft', createdAt: '', updatedAt: '',
}

function setup(items: object[] = [], groups: object[] = []) {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] }).as('sites')
  cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) } })
  cy.wait('@me')
}

describe('Duplicate content item', () => {
  it('duplicates a standalone item — calls API and refreshes the list', () => {
    const duplicate = { ...cardItem, id: 'c1-dup', orderPosition: 1, data: { title: 'Anunț important' } }

    setup([cardItem])
    cy.intercept('POST', '/api/admin/content/c1/duplicate', { statusCode: 201, body: duplicate }).as('duplicate')
    cy.intercept('GET', '/api/admin/content', { items: [cardItem, duplicate] }).as('contentAfter')

    cy.get('[data-testid="item-menu-trigger-c1"]').click()
    cy.get('[data-testid="item-menu-duplicate-c1"]').click()

    cy.wait('@duplicate')
    cy.wait('@contentAfter')
    cy.get('[data-testid="content-row-c1-dup"]').should('exist')
  })

  it('duplicate does not include thumbnail (media attachment)', () => {
    const duplicate = { ...cardItem, id: 'c1-dup', orderPosition: 1, data: { title: 'Anunț important' } }

    setup([cardItem])
    cy.intercept('POST', '/api/admin/content/c1/duplicate', { statusCode: 201, body: duplicate }).as('duplicate')
    cy.intercept('GET', '/api/admin/content', { items: [cardItem, duplicate] }).as('contentAfter')

    cy.get('[data-testid="item-menu-trigger-c1"]').click()
    cy.get('[data-testid="item-menu-duplicate-c1"]').click()

    cy.wait('@duplicate').its('response.body.data').should('not.have.property', 'thumbnail')
    cy.wait('@contentAfter')
    cy.get('[data-testid="content-row-c1-dup"]').should('exist')
  })

  it('duplicates an item inside a group — new item appears in same group', () => {
    const duplicate = { ...groupItem, id: 'c2-dup', orderPosition: 3 }

    setup([groupItem], [group])
    cy.intercept('POST', '/api/admin/content/c2/duplicate', { statusCode: 201, body: duplicate }).as('duplicate')
    cy.intercept('GET', '/api/admin/content', { items: [groupItem, duplicate] }).as('contentAfter')

    cy.get('[data-testid="item-menu-trigger-c2"]').click()
    cy.get('[data-testid="item-menu-duplicate-c2"]').click()

    cy.wait('@duplicate')
    cy.wait('@contentAfter')

    cy.get('[data-testid="group-block-g1"]').within(() => {
      cy.get('[data-testid="content-row-c2-dup"]').should('exist')
    })
  })

  it('shows a toast confirmation after duplicate', () => {
    const duplicate = { ...cardItem, id: 'c1-dup', orderPosition: 1, data: { title: 'Anunț important' } }

    setup([cardItem])
    cy.intercept('POST', '/api/admin/content/c1/duplicate', { statusCode: 201, body: duplicate }).as('duplicate')
    cy.intercept('GET', '/api/admin/content', { items: [cardItem, duplicate] }).as('contentAfter')

    cy.get('[data-testid="item-menu-trigger-c1"]').click()
    cy.get('[data-testid="item-menu-duplicate-c1"]').click()

    cy.wait('@duplicate')
    cy.contains('Element duplicat').should('be.visible')
  })
})
