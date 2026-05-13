/**
 * Chronological ordering of content within groups:
 * - sort button reorders existing items by startDate (undated items go last)
 * - creating a new item inside a group auto-inserts it at the correct chronological position
 */
const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'

const group = {
  id: 'g1', title: 'Grup test', sites: [], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '',
}

// Items intentionally out of chronological order
const itemMarch = { id: 'i-mar', type: 'card', state: 'draft', sites: [], orderPosition: 0, groupId: 'g1', expiresAt: null, data: { title: 'Martisor', startDate: '2026-03-01' }, createdAt: '', updatedAt: '' }
const itemJan   = { id: 'i-jan', type: 'card', state: 'draft', sites: [], orderPosition: 1, groupId: 'g1', expiresAt: null, data: { title: 'Revelion', startDate: '2026-01-01' }, createdAt: '', updatedAt: '' }
const itemMay   = { id: 'i-may', type: 'card', state: 'draft', sites: [], orderPosition: 2, groupId: 'g1', expiresAt: null, data: { title: 'Paste', startDate: '2026-05-01' }, createdAt: '', updatedAt: '' }
const itemNoDt  = { id: 'i-ndt', type: 'card', state: 'draft', sites: [], orderPosition: 3, groupId: 'g1', expiresAt: null, data: { title: 'Fara data' }, createdAt: '', updatedAt: '' }

const contentOrderRoute = { method: 'PUT', pathname: '/api/admin/content/order' } as const

function setup(items: object[] = []) {
  cy.intercept('GET', '/api/auth/me', mockUser)
  cy.intercept('GET', '/api/admin/content', { items }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [group] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] })
  cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) } })
  cy.wait('@content')
  cy.wait('@groups')
}

function expandGroup() {
  cy.get('[data-testid="collapse-toggle-g1"]').click()
}

describe('Chronological ordering within groups', () => {
  describe('Sort button', () => {
    it('renders a sort chronological button per group', () => {
      setup([itemMarch, itemJan])
      cy.get('[data-testid="group-sort-chronological-g1"]').should('exist')
    })

    it('calls /api/admin/content/order with items sorted by startDate ascending', () => {
      setup([itemMarch, itemJan, itemMay, itemNoDt])

      cy.intercept(contentOrderRoute, { items: [] }).as('reorder')

      cy.get('[data-testid="group-sort-chronological-g1"]').click()

      cy.wait('@reorder').its('request.body.order').should('deep.equal', [
        'i-jan',   // 2026-01-01 — earliest
        'i-mar',   // 2026-03-01
        'i-may',   // 2026-05-01
        'i-ndt',   // no date — goes last
      ])
    })

    it('places undated items at the end when sorting', () => {
      const onlyUndated = [
        { ...itemNoDt, id: 'nd-1', orderPosition: 0, data: { title: 'A' } },
        { ...itemJan,  id: 'dt-1', orderPosition: 1, data: { title: 'B', startDate: '2026-06-01' } },
        { ...itemNoDt, id: 'nd-2', orderPosition: 2, data: { title: 'C' } },
      ]
      setup(onlyUndated)

      cy.intercept(contentOrderRoute, { items: [] }).as('reorder')

      cy.get('[data-testid="group-sort-chronological-g1"]').click()

      cy.wait('@reorder').its('request.body.order').then(order => {
        expect(order[0]).to.equal('dt-1')    // dated item first
        expect(order).to.include('nd-1')
        expect(order).to.include('nd-2')
      })
    })

    it('handles a group with all undated items without error', () => {
      const allUndated = [
        { ...itemNoDt, id: 'nd-a', orderPosition: 0 },
        { ...itemNoDt, id: 'nd-b', orderPosition: 1 },
      ]
      setup(allUndated)

      cy.intercept(contentOrderRoute, { items: [] }).as('reorder')

      cy.get('[data-testid="group-sort-chronological-g1"]').click()

      cy.wait('@reorder').its('request.body.order').should('have.length', 2)
    })
  })

  describe('Auto-placement on create', () => {
    it('inserts a new item at the correct chronological position after creation', () => {
      // Group has Jan and May; we create an item for March — should land between them
      setup([itemJan, itemMay])
      expandGroup()

      const newItem = {
        id: 'i-new', type: 'card', state: 'draft', sites: [], orderPosition: 99,
        groupId: 'g1', expiresAt: null,
        data: { title: 'Ziua Mamei', startDate: '2026-03-08' },
        createdAt: '', updatedAt: '',
      }

      cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: newItem }).as('create')
      cy.intercept(contentOrderRoute, { items: [] }).as('reorder')

      cy.get('[data-testid="group-add-content-g1"]').click()
      cy.get('[data-testid="create-type-select"]').select('card')
      cy.get('[data-testid="create-title-input"]').type('Ziua Mamei')
      cy.get('[data-testid="create-date-input"]').type('2026-03-08')
      cy.get('[data-testid="create-submit-btn"]').click()

      cy.wait('@create')
      cy.wait('@reorder').its('request.body.order').should('deep.equal', [
        'i-jan',   // 2026-01-01
        'i-new',   // 2026-03-08
        'i-may',   // 2026-05-01
      ])
    })

    it('appends a new undated item at the end of the group', () => {
      setup([itemJan, itemMay])
      expandGroup()

      const newUndated = {
        id: 'i-new', type: 'card', state: 'draft', sites: [], orderPosition: 99,
        groupId: 'g1', expiresAt: null,
        data: { title: 'Fara data' },
        createdAt: '', updatedAt: '',
      }

      cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: newUndated }).as('create')
      cy.intercept(contentOrderRoute, { items: [] }).as('reorder')

      cy.get('[data-testid="group-add-content-g1"]').click()
      cy.get('[data-testid="create-type-select"]').select('card')
      cy.get('[data-testid="create-title-input"]').type('Fara data')
      cy.get('[data-testid="create-submit-btn"]').click()

      cy.wait('@create')
      cy.wait('@reorder').its('request.body.order').should('deep.equal', [
        'i-jan',   // 2026-01-01
        'i-may',   // 2026-05-01
        'i-new',   // no date — appended last
      ])
    })

    it('places new item after existing items with the same date (stable insertion)', () => {
      const sameDate1 = { ...itemJan, id: 'sd-1', orderPosition: 0, data: { title: 'Same1', startDate: '2026-03-01' } }
      const sameDate2 = { ...itemJan, id: 'sd-2', orderPosition: 1, data: { title: 'Same2', startDate: '2026-03-01' } }
      setup([sameDate1, sameDate2])
      expandGroup()

      const newSameDate = {
        id: 'sd-new', type: 'card', state: 'draft', sites: [], orderPosition: 99,
        groupId: 'g1', expiresAt: null,
        data: { title: 'Same3', startDate: '2026-03-01' },
        createdAt: '', updatedAt: '',
      }

      cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: newSameDate }).as('create')
      cy.intercept(contentOrderRoute, { items: [] }).as('reorder')

      cy.get('[data-testid="group-add-content-g1"]').click()
      cy.get('[data-testid="create-type-select"]').select('card')
      cy.get('[data-testid="create-title-input"]').type('Same3')
      cy.get('[data-testid="create-date-input"]').type('2026-03-01')
      cy.get('[data-testid="create-submit-btn"]').click()

      cy.wait('@create')
      cy.wait('@reorder').its('request.body.order').then(order => {
        // New item should come after existing items with the same date
        expect(order.indexOf('sd-new')).to.be.greaterThan(order.indexOf('sd-1'))
        expect(order.indexOf('sd-new')).to.be.greaterThan(order.indexOf('sd-2'))
      })
    })
  })
})
