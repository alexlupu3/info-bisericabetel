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
    // Ordering is now handled server-side during the POST call.
    // The frontend simply invalidates and re-fetches; tests verify the DOM
    // reflects the sorted order returned by the server after creation.

    it('does NOT call the reorder endpoint after creation (server handles it)', () => {
      setup([itemJan, itemMay])
      expandGroup()

      const newItem = {
        id: 'i-new', type: 'card', state: 'draft', sites: [], orderPosition: 1,
        groupId: 'g1', expiresAt: null,
        data: { title: 'Ziua Mamei', startDate: '2026-03-08' },
        createdAt: '', updatedAt: '',
      }

      cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: newItem }).as('create')
      cy.intercept(contentOrderRoute, cy.spy().as('reorderSpy'))

      cy.get('[data-testid="group-add-content-g1"]').click()
      cy.get('[data-testid="create-type-select"]').select('card')
      cy.get('[data-testid="create-title-input"]').type('Ziua Mamei')
      cy.get('[data-testid="create-date-input"]').type('2026-03-08')
      cy.get('[data-testid="create-submit-btn"]').click()

      cy.wait('@create')
      // Give the UI time to settle, then verify no reorder call was made
      cy.get('@reorderSpy').should('not.have.been.called')
    })

    it('displays items in chronological order after creating a mid-range dated item', () => {
      setup([itemJan, itemMay])
      expandGroup()

      const newItem = {
        id: 'i-new', type: 'card', state: 'draft', sites: [], orderPosition: 1,
        groupId: 'g1', expiresAt: null,
        data: { title: 'Ziua Mamei', startDate: '2026-03-08' },
        createdAt: '', updatedAt: '',
      }

      cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: newItem }).as('create')
      // Server returns items in the sorted order it persisted
      cy.intercept('GET', '/api/admin/content', {
        items: [
          { ...itemJan, orderPosition: 0 },
          { ...newItem, orderPosition: 1 },
          { ...itemMay, orderPosition: 2 },
        ],
      }).as('contentRefetch')

      cy.get('[data-testid="group-add-content-g1"]').click()
      cy.get('[data-testid="create-type-select"]').select('card')
      cy.get('[data-testid="create-title-input"]').type('Ziua Mamei')
      cy.get('[data-testid="create-date-input"]').type('2026-03-08')
      cy.get('[data-testid="create-submit-btn"]').click()

      cy.wait('@create')
      cy.wait('@contentRefetch')

      cy.get('[data-testid="container-g1"] [data-testid^="content-row-"]')
        .should('have.length', 3)
        .then($rows => {
          const ids = [...$rows].map(el => el.getAttribute('data-testid')!.replace('content-row-', ''))
          expect(ids).to.deep.equal(['i-jan', 'i-new', 'i-may'])
        })
    })

    it('displays undated new item last in the group', () => {
      setup([itemJan, itemMay])
      expandGroup()

      const newUndated = {
        id: 'i-new', type: 'card', state: 'draft', sites: [], orderPosition: 2,
        groupId: 'g1', expiresAt: null,
        data: { title: 'Fara data' },
        createdAt: '', updatedAt: '',
      }

      cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: newUndated }).as('create')
      cy.intercept('GET', '/api/admin/content', {
        items: [
          { ...itemJan, orderPosition: 0 },
          { ...itemMay, orderPosition: 1 },
          { ...newUndated, orderPosition: 2 },
        ],
      }).as('contentRefetch')

      cy.get('[data-testid="group-add-content-g1"]').click()
      cy.get('[data-testid="create-type-select"]').select('card')
      cy.get('[data-testid="create-title-input"]').type('Fara data')
      cy.get('[data-testid="create-submit-btn"]').click()

      cy.wait('@create')
      cy.wait('@contentRefetch')

      cy.get('[data-testid="container-g1"] [data-testid^="content-row-"]')
        .should('have.length', 3)
        .then($rows => {
          const ids = [...$rows].map(el => el.getAttribute('data-testid')!.replace('content-row-', ''))
          expect(ids[2]).to.equal('i-new')   // undated item is last
        })
    })

    it('displays new same-date item after existing same-date items', () => {
      const sameDate1 = { ...itemJan, id: 'sd-1', orderPosition: 0, data: { title: 'Same1', startDate: '2026-03-01' } }
      const sameDate2 = { ...itemJan, id: 'sd-2', orderPosition: 1, data: { title: 'Same2', startDate: '2026-03-01' } }
      setup([sameDate1, sameDate2])
      expandGroup()

      const newSameDate = {
        id: 'sd-new', type: 'card', state: 'draft', sites: [], orderPosition: 2,
        groupId: 'g1', expiresAt: null,
        data: { title: 'Same3', startDate: '2026-03-01' },
        createdAt: '', updatedAt: '',
      }

      cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: newSameDate }).as('create')
      cy.intercept('GET', '/api/admin/content', {
        items: [
          { ...sameDate1, orderPosition: 0 },
          { ...sameDate2, orderPosition: 1 },
          { ...newSameDate, orderPosition: 2 },
        ],
      }).as('contentRefetch')

      cy.get('[data-testid="group-add-content-g1"]').click()
      cy.get('[data-testid="create-type-select"]').select('card')
      cy.get('[data-testid="create-title-input"]').type('Same3')
      cy.get('[data-testid="create-date-input"]').type('2026-03-01')
      cy.get('[data-testid="create-submit-btn"]').click()

      cy.wait('@create')
      cy.wait('@contentRefetch')

      cy.get('[data-testid="container-g1"] [data-testid^="content-row-"]')
        .should('have.length', 3)
        .then($rows => {
          const ids = [...$rows].map(el => el.getAttribute('data-testid')!.replace('content-row-', ''))
          expect(ids.indexOf('sd-new')).to.be.greaterThan(ids.indexOf('sd-1'))
          expect(ids.indexOf('sd-new')).to.be.greaterThan(ids.indexOf('sd-2'))
        })
    })
  })
})
