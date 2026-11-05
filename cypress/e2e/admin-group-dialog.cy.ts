/**
 * Group create/edit dialogs (spec 09, FR-114): "Grup nou" / "Editează grupul", same
 * dismissal and leave-page rules as the content dialog (BR-060), after-save landing.
 */
import { beforeUnloadPrevented, group, stubAdmin, visitAdmin } from '../support/helpers/admin'

const g1 = group('g1', 'Anunțuri')

describe('Group dialog — create', () => {
  beforeEach(() => stubAdmin({ groups: [g1] }))

  it('happy flow: create, close, toast, highlight and focus the new block', () => {
    const created = group('g-new', 'Tabere', { sites: ['centru'] })
    cy.intercept('POST', '/api/admin/groups', { statusCode: 201, body: created }).as('create')
    visitAdmin()
    cy.get('[data-testid="create-group-btn"]').click()
    cy.get('[data-testid="group-dialog"]').should('be.visible').and('contain', 'Grup nou')
    cy.get('[data-testid="group-dialog"] [data-testid="create-group-form"]').should('exist')
    cy.location('search').should('eq', '?newGroup=1')
    cy.focused().should('have.attr', 'data-testid', 'create-group-title')

    cy.intercept('GET', '/api/admin/groups', { groups: [g1, created] }).as('refreshed')
    cy.get('[data-testid="create-group-title"]').type('Tabere')
    cy.get('[data-testid="create-group-site-centru"]').check()
    cy.get('[data-testid="create-group-submit"]').click()
    cy.wait('@create').its('request.body').should('deep.equal', { title: 'Tabere', sites: ['centru'] })

    cy.get('[data-testid="group-dialog"]').should('not.exist')
    cy.get('[data-testid="toast"]').should('contain', 'Grup creat')
    cy.get('[data-testid="group-block-g-new"]').should('have.attr', 'data-highlight', 'true')
    cy.focused().should('have.attr', 'data-testid', 'group-name-g-new')
    cy.location('search').should('eq', '')
  })

  it('Enter in the title submits; an empty title keeps submit disabled', () => {
    cy.intercept('POST', '/api/admin/groups', { statusCode: 201, body: group('g2', 'X') }).as('create')
    visitAdmin()
    cy.get('[data-testid="create-group-btn"]').click()
    cy.get('[data-testid="create-group-submit"]').should('be.disabled')
    cy.get('[data-testid="create-group-title"]').type('{enter}')
    cy.get('[data-testid="group-dialog"]').should('be.visible')
    cy.get('[data-testid="create-group-title"]').type('X{enter}')
    cy.wait('@create')
    cy.get('[data-testid="group-dialog"]').should('not.exist')
  })
})

describe('Group dialog — edit', () => {
  beforeEach(() => stubAdmin({ groups: [g1] }))

  it('the group name opens "Editează grupul" prefilled; saving patches and keeps it collapsed', () => {
    cy.intercept('PATCH', '/api/admin/groups/g1', { ...g1, title: 'Anunțuri noi' }).as('patch')
    visitAdmin()
    cy.get('[data-testid="collapse-toggle-g1"]').should('have.attr', 'aria-label', 'Extinde grup')
    cy.get('[data-testid="group-name-g1"]').click()
    cy.location('search').should('eq', '?editGroup=g1')
    cy.get('[data-testid="group-dialog"]').should('contain', 'Editează grupul')
    cy.get('[data-testid="group-dialog"] [data-testid="edit-group-panel-g1"]').should('exist')
    cy.get('[data-testid="edit-group-title-g1"]').should('have.value', 'Anunțuri').clear().type('Anunțuri noi')
    cy.get('[data-testid="edit-group-save-g1"]').click()
    cy.wait('@patch').its('request.body.title').should('eq', 'Anunțuri noi')
    cy.get('[data-testid="group-dialog"]').should('not.exist')
    cy.get('[data-testid="toast"]').should('contain', 'Grup actualizat')
    cy.get('[data-testid="group-block-g1"]').should('have.attr', 'data-highlight', 'true')
    cy.get('[data-testid="collapse-toggle-g1"]').should('have.attr', 'aria-label', 'Extinde grup')
  })

  it('also opens from the group menu', () => {
    visitAdmin()
    cy.get('[data-testid="group-menu-trigger-g1"]').click()
    cy.get('[data-testid="group-menu-edit-g1"]').click()
    cy.get('[data-testid="group-dialog"]').should('contain', 'Editează grupul')
    cy.get('[data-testid="edit-group-title-g1"]').should('have.value', 'Anunțuri')
  })

  it('dismissal: untouched closes at once; renamed asks; "Renunță" makes no request', () => {
    cy.intercept('PATCH', '/api/admin/groups/g1', cy.spy().as('patch'))
    visitAdmin()
    cy.get('[data-testid="group-name-g1"]').click()
    cy.focused().type('{esc}')
    cy.get('[data-testid="group-dialog"]').should('not.exist')
    cy.focused().should('have.attr', 'data-testid', 'group-name-g1')

    cy.get('[data-testid="group-name-g1"]').click()
    cy.get('[data-testid="edit-group-title-g1"]').type(' 2').type('{esc}')
    cy.get('[data-testid="discard-confirm"]').should('be.visible')
    cy.get('[data-testid="discard-confirm-discard"]').click()
    cy.get('[data-testid="group-dialog"]').should('not.exist')
    cy.get('@patch').should('not.have.been.called')
  })

  it('leave-page: a dirty group dialog prevents beforeunload and guards Back', () => {
    visitAdmin()
    cy.get('[data-testid="group-name-g1"]').click()
    cy.get('[data-testid="edit-group-site-vest"]').check()
    beforeUnloadPrevented().should('eq', true)
    cy.go('back')
    cy.get('[data-testid="discard-confirm"]').should('be.visible')
    cy.location('search').should('eq', '?editGroup=g1')
    cy.get('[data-testid="edit-group-site-vest"]').should('be.checked')
  })

  it('regression: Back during a save is dropped; only the dialog close moves the URL', () => {
    cy.intercept('GET', '/api/admin/media*', { media: [] })
    cy.intercept('PATCH', '/api/admin/groups/g1', { body: { ...g1, title: 'Anunțuri noi' }, delay: 600 }).as('patch')
    visitAdmin('/admin/media')
    cy.get('[data-testid="nav-content"]').click()
    cy.get('[data-testid="group-name-g1"]').click()
    cy.get('[data-testid="edit-group-title-g1"]').clear().type('Anunțuri noi')
    cy.get('[data-testid="edit-group-save-g1"]').click()
    cy.go('back')
    cy.location('search').should('eq', '?editGroup=g1')
    cy.wait('@patch')

    cy.get('[data-testid="group-dialog"]').should('not.exist')
    cy.get('[data-testid="discard-confirm"]').should('not.exist')
    cy.location('pathname').should('eq', '/admin/content')
    cy.location('search').should('eq', '')
    cy.wait(300)
    cy.location('pathname').should('eq', '/admin/content')
    cy.go('back')
    cy.location('pathname').should('eq', '/admin/media')
  })

  it('?editGroup=<missing> shows "Grupul nu mai există" and cleans the URL', () => {
    visitAdmin('/admin/content?editGroup=missing')
    cy.get('[data-testid="toast"]').should('contain', 'Grupul nu mai există')
    cy.location('search').should('eq', '')
    cy.get('[data-testid="group-dialog"]').should('not.exist')
  })
})
