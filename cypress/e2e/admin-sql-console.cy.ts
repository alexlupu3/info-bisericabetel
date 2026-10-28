/**
 * Super-admin SQL console: double-confirm warning modal, results and validation errors
 */
const SQL_URL = '/admin/sql'
const mockToken = 'mock-jwt-token'
const mockSites = [{ slug: 'centru', name: 'Centru', accent: '#3b82f6' }]

const superAdmin = { id: 'u1', email: 'superadmin@betel.ro', role: 'super-admin', mustChangePassword: false }
const admin      = { id: 'u2', email: 'admin@betel.ro',      role: 'admin',       mustChangePassword: false }

const selectResult = {
  command: 'SELECT',
  columns: [{ name: 'slug', typeOid: 25 }, { name: 'address', typeOid: 25 }],
  rows: [{ slug: 'centru', address: null }],
  rowCount: 1,
  truncated: false,
  durationMs: 4,
}

function visitAs(user: typeof superAdmin) {
  cy.intercept('GET', '/api/auth/me', user).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [] })
  cy.intercept('GET', '/api/admin/groups', { groups: [] })
  cy.intercept('GET', '/api/sites', { sites: mockSites })
  cy.visit(SQL_URL, {
    onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) },
  })
  cy.wait('@me')
}

describe('Admin — SQL console (super-admin only)', () => {
  it('is hidden from regular admins', () => {
    visitAs(admin)
    cy.get('nav').contains('SQL').should('not.exist')
    cy.location('pathname').should('eq', '/admin/content')
  })

  describe('as super-admin', () => {
    beforeEach(() => {
      visitAs(superAdmin)
    })

    it('runs a query only after the confirm button is pressed twice', () => {
      cy.intercept('POST', '/api/admin/sql', selectResult).as('runSql')

      cy.get('[data-testid="sql-editor"]').type('select slug, address from sites')
      cy.get('[data-testid="sql-run"]').click()
      cy.get('[data-testid="sql-confirm-modal"]').should('be.visible')
      cy.get('[data-testid="sql-confirm-mode"]').should('contain', 'doar citire')

      cy.get('[data-testid="sql-confirm-run"]').click()
      cy.get('[data-testid="sql-confirm-run"]').should('have.attr', 'data-armed', 'true')
      cy.get('[data-testid="sql-confirm-modal"]').should('be.visible')
      cy.get('[data-testid="sql-confirm-run"]').click()

      cy.wait('@runSql').its('request.body').should('deep.equal', {
        query: 'select slug, address from sites', readOnly: true,
      })
      cy.get('[data-testid="sql-confirm-modal"]').should('not.exist')
      cy.get('[data-testid="sql-result-meta"]').should('contain', 'SELECT').and('contain', '1 rând')
      cy.get('[data-testid="sql-result-table"]').should('contain', 'centru').and('contain', 'NULL')
    })

    it('disarms the confirm button after 5 seconds', () => {
      cy.clock()
      cy.intercept('POST', '/api/admin/sql', cy.spy().as('runSql'))

      cy.get('[data-testid="sql-editor"]').type('select 1')
      cy.get('[data-testid="sql-run"]').click()
      cy.get('[data-testid="sql-confirm-run"]').click()
      cy.get('[data-testid="sql-confirm-run"]').should('have.attr', 'data-armed', 'true')

      cy.tick(5200)
      cy.get('[data-testid="sql-confirm-run"]').should('have.attr', 'data-armed', 'false')

      // A single press after expiry only re-arms; nothing is sent
      cy.get('[data-testid="sql-confirm-run"]').click()
      cy.get('[data-testid="sql-confirm-run"]').should('have.attr', 'data-armed', 'true')
      cy.get('@runSql').should('not.have.been.called')
    })

    it('cancels without running', () => {
      cy.intercept('POST', '/api/admin/sql', cy.spy().as('runSql'))
      cy.get('[data-testid="sql-editor"]').type('select 1')
      cy.get('[data-testid="sql-run"]').click()
      cy.get('[data-testid="sql-confirm-cancel"]').click()
      cy.get('[data-testid="sql-confirm-modal"]').should('not.exist')
      cy.get('@runSql').should('not.have.been.called')
    })

    it('sends readOnly=false when writes are allowed', () => {
      cy.intercept('POST', '/api/admin/sql', {
        command: 'UPDATE', columns: [], rows: [], rowCount: 2, truncated: false, durationMs: 3,
      }).as('runSql')

      cy.get('[data-testid="sql-read-only"]').uncheck()
      cy.get('[data-testid="sql-editor"]').type("update sites set name = 'X' where slug = 'centru'")
      cy.get('[data-testid="sql-run"]').click()
      cy.get('[data-testid="sql-confirm-mode"]').should('contain', 'cu modificări')
      cy.get('[data-testid="sql-confirm-run"]').click()
      cy.get('[data-testid="sql-confirm-run"]').click()

      cy.wait('@runSql').its('request.body.readOnly').should('eq', false)
      cy.get('[data-testid="sql-result-meta"]').should('contain', 'UPDATE').and('contain', '2 rânduri')
    })

    it('shows a validation error with its location and hint', () => {
      cy.intercept('POST', '/api/admin/sql', {
        statusCode: 400,
        body: {
          kind: 'database', error: 'syntax error at or near "form"', pgCode: '42601',
          position: 10, line: 1, column: 10,
        },
      }).as('runSql')

      cy.get('[data-testid="sql-editor"]').type('select * form sites')
      cy.get('[data-testid="sql-run"]').click()
      cy.get('[data-testid="sql-confirm-run"]').click()
      cy.get('[data-testid="sql-confirm-run"]').click()
      cy.wait('@runSql')

      cy.get('[data-testid="sql-error"]').should('have.attr', 'data-kind', 'database')
      cy.get('[data-testid="sql-error"]').should('contain', 'Eroare PostgreSQL').and('contain', 'linia 1, coloana 10')
      cy.get('[data-testid="sql-error-message"]').should('contain', 'syntax error at or near "form"')
      cy.get('[data-testid="sql-error-location"]').should('contain', 'select * form sites')
    })

    it('shows when the dangerous-command filter blocks a query', () => {
      cy.intercept('POST', '/api/admin/sql', {
        statusCode: 400,
        body: {
          kind: 'blocked', error: 'DELETE without a WHERE clause would affect every row and is not allowed.',
          position: 1, line: 1, column: 1, hint: 'Add a WHERE clause that selects the rows to change.',
        },
      }).as('runSql')

      cy.get('[data-testid="sql-read-only"]').uncheck()
      cy.get('[data-testid="sql-editor"]').type('delete from groups')
      cy.get('[data-testid="sql-run"]').click()
      cy.get('[data-testid="sql-confirm-run"]').click()
      cy.get('[data-testid="sql-confirm-run"]').click()
      cy.wait('@runSql')

      cy.get('[data-testid="sql-error"]').should('have.attr', 'data-kind', 'blocked').and('contain', 'Comandă blocată')
      cy.get('[data-testid="sql-error-hint"]').should('contain', 'WHERE')
    })
  })
})
